/**
 * LEDGR AI Categorization Engine
 *
 * Smart transaction categorization using:
 * - Merchant name pattern matching
 * - IBAN prefix matching (known bank creditors)
 * - Multilingual keyword detection (NL/DE/FR/EN/BE)
 * - Confidence scoring (0–100)
 * - User learning rules (override memory)
 *
 * Rules are evaluated in priority order:
 *  1. User rules (always win, confidence=100)
 *  2. IBAN exact match (confidence=95)
 *  3. Merchant name exact match (confidence=90)
 *  4. Merchant pattern (regex, confidence=80)
 *  5. Keyword in description (confidence=60)
 *  6. ING transaction code TRCD (confidence=70)
 */

import { normalizeIban } from "@/lib/import/number-parser";
import { normalizeMerchant } from "@/lib/categorization/merchant-normalizer";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface CategorySuggestion {
  categorySlug: string;
  categoryName: string;
  confidence: number;
  matchedBy: MatchReason;
  matchedValue: string;
}

export type MatchReason =
  | "user_rule"
  | "iban_exact"
  | "merchant_exact"
  | "merchant_pattern"
  | "keyword_description"
  | "transaction_code";

export interface CategorizationRule {
  slug: string;
  name: string;
  type: "INCOME" | "EXPENSE" | "TRANSFER";
  ibanPrefixes?: string[];
  merchantExact?: string[];
  merchantPatterns?: RegExp[];
  keywords?: string[];
  trcdCodes?: string[];
  confidence: number;
}

export interface UserLearningRule {
  userId: string;
  counterpartyIban?: string;
  merchantNameContains?: string;
  descriptionContains?: string;
  categorySlug: string;
  categoryName: string;
  createdAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// DESCRIPTION EXTRACTOR
// Strips card-payment noise from KBC/ING/Rabobank descriptions so the
// merchant name buried inside can match patterns and aliases.
// e.g. "KAARTBETALING NR 12345 25/01 ALBERT HEIJN AMSTERDAM NL" → "albert heijn amsterdam nl"
// ─────────────────────────────────────────────────────────────────────────────

function extractMerchantFromDescription(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(
      /^(kaartbetaling|kaartbet|bancontact|maestro|visa\s*debit|debit\s*card|credit\s*card|pinbetaling|contactloos|pos\s*|ovpay|ov[\s-]?betaling|apple\s*pay|google\s*pay|betaling\s*via)\s*(?:nr\.?\s*[\d*\s]+)?\s*/i,
      ""
    )
    // strip embedded dates: "25/01" or "25-01-24"
    .replace(/\b\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?\b/g, "")
    // strip trailing country codes
    .replace(/\s+\b(nl|be|de|fr|gb|uk|us|lu)\b\s*$/i, "")
    // strip long number sequences (card/terminal IDs)
    .replace(/\b\d{5,}\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILT-IN RULES
// ─────────────────────────────────────────────────────────────────────────────

export const BUILT_IN_RULES: CategorizationRule[] = [

  // ── INCOME ───────────────────────────────────────────────────────────────

  {
    slug: "salary",
    name: "Salary",
    type: "INCOME",
    merchantExact: ["2xpr bv", "2xpr"],
    keywords: ["salaris", "salary", "loon", "verloning", "overboeking salaris", "overboeking deel salaris"],
    confidence: 85,
  },
  {
    slug: "child_benefit",
    name: "Child Benefit",
    type: "INCOME",
    merchantExact: ["parentia vlaanderen vzw"],
    keywords: ["groeipakket", "gezinsbijslag", "kinderbijslag", "kindergeld"],
    confidence: 90,
  },
  {
    slug: "refund_income",
    name: "Refund Received",
    type: "INCOME",
    merchantExact: ["bolcom bv"],
    keywords: ["terugboeking", "terugbetaling", "retour", "geretourneerd", "restitutie", "remboursement", "rückerstattung"],
    confidence: 80,
  },
  {
    slug: "interest",
    name: "Interest",
    type: "INCOME",
    keywords: ["rente", "rentecorrectie", "rente buiten limiet"],
    trcdCodes: ["09101"],
    confidence: 85,
  },
  {
    slug: "stripe_income",
    name: "Stripe Payout",
    type: "INCOME",
    merchantExact: ["stripe", "stripe payments europe"],
    merchantPatterns: [/stripe/i],
    ibanPrefixes: ["IE29AIBK"],
    keywords: ["stripe payout", "stripe transfer"],
    confidence: 90,
  },

  // ── EXPENSE: GROCERIES ────────────────────────────────────────────────────

  {
    slug: "groceries",
    name: "Groceries",
    type: "EXPENSE",
    merchantPatterns: [
      /\bah\b/i, /albert\s?heijn/i, /ah\s?jan\s?linders/i, /ah\s?to\s?go/i,
      /\blidl\b/i, /\baldi\b/i, /\bjumbo\b/i,
      /\bplus\s*(supermarkt)?\b/i, /\bdirk\b/i, /\bnah\b/i,
      /\bdelhaize\b/i, /\bdistri\b/i, /\bcora\b/i,
      /\bcolruyt\b/i, /\bnetto\b/i, /\bspar\b/i, /\bpicnic\b/i,
      /kaufland/i,
      // UK
      /\btesco\b/i, /sainsbury/i, /\basda\b/i, /waitrose/i, /morrisons/i,
      /marks\s*(and|&)\s*spencer/i,
      // DE
      /\brewe\b/i, /\bedeka\b/i, /\bpenny\b/i, /\bnetto\s?marken/i,
      // FR/BE
      /\bauchan\b/i, /monoprix/i, /intermarche|intermarché/i, /\bleclerc\b/i,
      /\bcasino\b/i,
    ],
    keywords: ["supermarkt", "boodschappen", "groceries", "supermarché", "lebensmittel"],
    confidence: 85,
  },

  // ── EXPENSE: FUEL / GAS ──────────────────────────────────────────────────

  {
    slug: "fuel",
    name: "Fuel",
    type: "EXPENSE",
    merchantPatterns: [
      /\bq8\b/i, /\bshell\b/i, /\bbp\b/i, /\besso\b/i,
      /\bavia\b/i, /\bdats\s?24\b/i,
      /\btotal\b/i, /totalenergies/i,
      /service\s?station/i, /\bpetrol/i,
      /\btank\s*(station)?\b/i,
    ],
    keywords: ["brandstof", "tanken", "benzine", "diesel", "fuel", "carburant", "kraftstoff"],
    confidence: 85,
  },

  // ── EXPENSE: TRANSPORT ────────────────────────────────────────────────────

  {
    slug: "transport",
    name: "Transport",
    type: "EXPENSE",
    merchantExact: ["uber", "bolt", "ns", "sncb", "nmbs", "deutsche bahn", "ov-chipkaart"],
    merchantPatterns: [
      /\buber\b(?!\s*eats)/i,
      /\bbolt\s*(eu|ride|app)?\b/i,
      /\bns\s*(reizigers|international|hispeed)?\b/i,
      /\bnmbs\b/i, /\bsncb\b/i,
      /deutsche\s*bahn/i, /\bdb\s*(bahn|fernverkehr|regio)?\b/i,
      /\bsncf\b/i,
      /\bthalys\b/i, /\beurail\b/i, /flixbus/i,
      /\bde\s*lijn\b/i, /\bstib\b/i, /\bmivb\b/i,
      /\bgvb\b/i, /\bret\b/i, /\bhtm\b/i,
      /blablacar/i,
      // OVPAY = Dutch OV chip tap payments
      /ovpay/i, /ov[\s-]?chip/i, /ov[\s-]?betaling/i,
      // City transport
      /\bryanair\b/i, /\beasyjet\b/i, /\bvueling\b/i, /\btransavia\b/i,
    ],
    keywords: ["trein", "metro", "tram", "bus", "ov-chipkaart", "transit", "rail",
               "fahrkarte", "bahnticket", "billet", "navigo", "ov betaling", "ovpay"],
    confidence: 85,
  },

  // ── EXPENSE: TELECOM ─────────────────────────────────────────────────────

  {
    slug: "telecom",
    name: "Telecom",
    type: "EXPENSE",
    merchantExact: ["odido", "mobile vikings", "proximus", "telenet", "orange", "kpn", "ziggo"],
    merchantPatterns: [
      /\bodido\b/i, /\bkpn\b/i, /\btelfort\b/i, /t[\s-]?mobile/i,
      /vodafone/i, /telenet/i, /proximus/i,
      /\borange\b/i, /\bbase\b/i, /\bziggo\b/i, /\btele2\b/i,
      /\bsfr\b/i, /bouygues/i, /\bfree\s*(mobile|telecom)?\b/i,
      /\bo2\b/i, /\bee\s*(mobile|network)?\b/i,
      /\bbt\s*(group|broadband|internet|sport)?\b/i,
      /\bmobile\s*vikings\b/i, /\bsimyo\b/i, /\blycamobile\b/i,
    ],
    ibanPrefixes: ["NL12COBA"],
    keywords: ["telefoon", "internet", "abonnement", "telecom", "mobile", "gsm",
               "breedbandinternet", "glasvezel"],
    confidence: 88,
  },

  // ── EXPENSE: APPLE SERVICES ──────────────────────────────────────────────
  // Separate high-confidence rule for Apple (was buried in subscriptions at 70)

  {
    slug: "apple_services",
    name: "Apple Services",
    type: "EXPENSE",
    merchantExact: ["apple", "itunes", "icloud"],
    merchantPatterns: [
      /apple\.com\/bill/i,
      /apple\.com/i,
      /\bapple\b/i,
      /\bitunes\b/i,
      /\bicloud\b/i,
    ],
    keywords: ["apple.com/bill", "itunes", "icloud", "app store"],
    confidence: 88,
  },

  // ── EXPENSE: STREAMING ────────────────────────────────────────────────────

  {
    slug: "streaming",
    name: "Streaming & Entertainment",
    type: "EXPENSE",
    merchantExact: ["netflix", "spotify", "disney+", "disney", "hbo", "videoland"],
    merchantPatterns: [
      /netflix/i,
      /spotify/i,
      /disney[\s+]?(plus|\+)/i,
      /\bhbo\b/i, /\bnow\s?tv\b/i,
      /amazon\s*prime\s*video/i, /\bprime\s*video\b/i,
      /youtube\s*premium/i,
      /\bdeezer\b/i, /\btidal\b/i,
      /\btwitch\b/i,
      /videoland/i,
      /\brtl\+/i, /\brtlxl\b/i,
      /streamz/i,
      /\bviaplay\b/i,
      /\bdiscovery\+/i,
      /\bparamount\+/i,
    ],
    keywords: ["streaming", "netflix", "spotify premium"],
    confidence: 88,
  },

  // ── EXPENSE: SOFTWARE / SAAS ─────────────────────────────────────────────

  {
    slug: "software_saas",
    name: "Software & SaaS",
    type: "EXPENSE",
    merchantExact: ["openai", "github", "vercel", "figma", "notion", "slack", "shopify"],
    merchantPatterns: [
      /openai/i, /chatgpt/i,
      /\bfigma\b/i, /\bnotion\b/i, /\bslack\b/i,
      /\bvercel\b/i, /github/i,
      /amazon\s*web\s*services/i, /\baws\b/i,
      /shopify/i,
      /\batlassian\b/i, /\bjira\b/i, /\bconfluence\b/i,
      /\blinear\b/i, /\bhubspot\b/i, /\bsalesforce\b/i,
      /\bzapier\b/i, /\bmake\.com\b/i, /\bairtable\b/i,
      /\bcloudflare\b/i, /\bdigitalocean\b/i, /\bhetzner\b/i,
      /\bovh\b/i, /\bsentry\b/i, /\bdatadog\b/i,
      /\btwilio\b/i, /\bsendgrid\b/i, /\bmailchimp\b/i,
      /\bintercom\b/i, /\bzendesk\b/i,
      /microsoft/i, /\bmicrosoft\s*365\b/i, /\boffice\s*365\b/i,
      /\badobe\b/i, /\bdropbox\b/i,
      /\bgoogle\s*(workspace|cloud|one|drive|storage)\b/i,
    ],
    keywords: ["software", "saas", "api subscription", "cloud service", "developer tools",
               "licentie", "licence", "lizenz"],
    confidence: 88,
  },

  // ── EXPENSE: UTILITIES ────────────────────────────────────────────────────

  {
    slug: "utilities",
    name: "Utilities",
    type: "EXPENSE",
    merchantExact: ["eneco", "vattenfall", "greenchoice", "nuon", "essent", "oxxio"],
    merchantPatterns: [
      // NL
      /\beneco\b/i, /vattenfall/i, /greenchoice/i, /\bnuon\b/i,
      /\bessent\b/i, /\boxxio\b/i, /\bstedin\b/i, /\bliander\b/i,
      /\bwaternet\b/i, /\bduinwater\b/i, /vitens/i,
      // BE
      /fluvius/i, /luminus/i, /electrabel/i,
      // DE
      /\be\.?on\b/i, /\brwe\b/i, /stadtwerke/i,
      // FR
      /\bedf\b/i, /\bengie\b/i, /gaz\s*de\s*france/i,
      // UK
      /british\s*gas/i, /\bnpower\b/i, /\bscottish\s*power\b/i,
      /\bthames\s*water\b/i, /\bsevern\s*trent\b/i,
    ],
    keywords: ["energie", "elektriciteit", "stroom", "gas", "water", "warmte",
               "nutsvoorziening", "electricité", "énergie", "strom",
               "utility", "electricity", "heating"],
    confidence: 85,
  },

  // ── EXPENSE: HEALTHCARE ───────────────────────────────────────────────────

  {
    slug: "healthcare",
    name: "Healthcare",
    type: "EXPENSE",
    merchantPatterns: [
      // NL pharmacies / drugstores
      /kruidvat/i, /\bbenu\b/i, /\bda\s*(drogist)?\b/i,
      /apotheek/i, /apotheke/i, /pharmacie/i, /\bpharmacy\b/i,
      // UK
      /\bboots\b/i, /superdrug/i, /\blloyds\s*pharmacy\b/i,
      // Hospitals / clinics
      /ziekenhuis/i, /\bkliniek\b/i, /clinique/i, /\bhospital\b/i,
      /\bclinique\b/i,
      // Doctors / specialists
      /huisarts/i, /tandarts/i, /\bdentist\b/i, /\bdoctor\b/i,
      /\bmedisch\b/i, /\bmedische\b/i,
      // Opticians
      /\bopticien\b/i, /\bgrandoptical\b/i, /\beauclaire\b/i,
      /\bspecsavers\b/i, /\beyes\+more\b/i,
    ],
    keywords: ["apotheek", "recept", "ziekenhuis", "dokter", "tandarts", "huisarts",
               "medisch", "farmacia", "pharmacie", "apotheke", "medikamente",
               "healthcare", "pharmacy", "prescription", "optiek"],
    confidence: 82,
  },

  // ── EXPENSE: ONLINE PAYMENTS / PAYPAL ────────────────────────────────────

  {
    slug: "online_payments",
    name: "Online Payments",
    type: "EXPENSE",
    merchantExact: ["paypal europe s.a.r.l. et cie s.c.a", "paypal (europe) s.a r.l. et cie, s.c.a."],
    merchantPatterns: [/paypal/i],
    ibanPrefixes: [
      "LU89751",
      "DE88500",
    ],
    keywords: ["paypal", "/paypal"],
    confidence: 95,
  },

  // ── EXPENSE: INVESTING & CRYPTO ───────────────────────────────────────────

  {
    slug: "investing",
    name: "Investing & Crypto",
    type: "EXPENSE",
    merchantExact: ["bitvavo", "degiro", "etoro", "binance", "coinbase", "kraken"],
    merchantPatterns: [
      /bitvavo/i,
      /\bdegiro\b/i,
      /\betoro\b/i,
      /\bbinance\b/i,
      /coinbase/i,
      /\bkraken\b/i,
      /flatex/i,
      /binckbank/i, /\bsaxo\b/i,
      /trading\s*212/i,
      /\bbitpanda\b/i,
      /\bfreetrade\b/i,
      /interactive\s*brokers/i,
      /\bswissquote\b/i,
    ],
    keywords: ["crypto", "bitcoin", "ethereum", "beleggen", "belegging", "aandelen",
               "investering", "investir", "anlage", "investment", "portfolio",
               "cryptovaluta", "staking"],
    confidence: 85,
  },

  // ── EXPENSE: INSURANCE ────────────────────────────────────────────────────

  {
    slug: "insurance",
    name: "Insurance",
    type: "EXPENSE",
    merchantExact: ["nationale nederlanden", "centraal beheer", "aegon", "achmea", "axa", "allianz"],
    merchantPatterns: [
      /nationale[\s-]?nederlanden/i, /\bnn\s*(group)?\b/i,
      /centraal[\s-]?beheer/i,
      /\bachmea\b/i, /\baegon\b/i,
      /\baxa\b/i, /allianz/i, /\bgenerali\b/i,
      /\baviva\b/i,
      /\bbaloise\b/i, /\bfidea\b/i, /\bag\s*insurance\b/i,
      /\bp\s*&\s*v\b/i,
      // DE
      /\bhansemerkur\b/i, /\bdebeka\b/i, /\bhuk\b/i,
      // UK
      /legal\s*&\s*general/i, /\bprudential\b/i,
    ],
    keywords: ["verzekering", "polis", "premie", "verzekeringspremie",
               "assurance", "versicherung", "insurance", "premium",
               "brandverzekering", "autoverzekering", "levensverzekering",
               "hospitalisatieverzekering"],
    confidence: 88,
  },

  // ── EXPENSE: HEALTH INSURANCE ────────────────────────────────────────────

  {
    slug: "health_insurance",
    name: "Health Insurance",
    type: "EXPENSE",
    merchantExact: ["solidaris limburg"],
    merchantPatterns: [
      /solidaris/i, /ziekenfonds/i, /mutualit/i, /krankenkasse/i,
      /assurance\s?maladie/i,
    ],
    keywords: ["ziekenfonds", "mutualiteit", "bijdrage", "aanvullende bijdrage",
               "aanvull bijdr", "mutualite"],
    ibanPrefixes: ["BE34363"],
    confidence: 90,
  },

  // ── EXPENSE: TAXES ────────────────────────────────────────────────────────

  {
    slug: "taxes",
    name: "Taxes",
    type: "EXPENSE",
    merchantExact: ["belastingdienst"],
    merchantPatterns: [
      /belastingdienst/i, /\brvz\b/i,
      /administration\s?fiscale/i, /finanzamt/i,
      /\bfisc\b/i,
    ],
    ibanPrefixes: ["NL86INGB0002"],
    keywords: ["belasting", "btw", "tax", "aanslagbiljet", "steuer", "impôt", " tva ", "tva 21", "tva 6", "tva 0"],
    confidence: 90,
  },

  // ── EXPENSE: GOVERNMENT / MUNICIPALITY ───────────────────────────────────

  {
    slug: "government",
    name: "Government",
    type: "EXPENSE",
    merchantPatterns: [
      /gemeente\s/i, /stad\s/i, /\bovj\b/i, /\btozo\b/i, /\bcoa\b/i,
    ],
    keywords: ["gemeente", "stadsdeel", "overheid", "maastricht", "tozo", "debiteur"],
    ibanPrefixes: ["NL66BNGH"],
    confidence: 80,
  },

  // ── EXPENSE: FOOD DELIVERY / RESTAURANTS ─────────────────────────────────

  {
    slug: "restaurants",
    name: "Restaurants & Food",
    type: "EXPENSE",
    merchantPatterns: [
      /\bkfc\b/i, /mcdonald/i, /\bbk\b/i, /burger\s?king/i,
      /takeaway/i, /thuisbezorgd/i, /deliveroo/i, /uber\s?eats/i,
      /\bwolt\b/i, /just\s*eat/i,
      /gorillas/i, /\bgetir\b/i,
      /foodticket/i, /eethuis/i,
      /frituur/i,
      /starbucks/i, /costa\s*coffee/i, /\bpret\b/i,
      /\bsubway\b/i, /domino/i, /pizza\s*hut/i,
      /\bnando/i, /\bgreggs\b/i, /\bwagamama\b/i,
      /\btaco\s*bell\b/i, /\bdunkin\b/i,
    ],
    keywords: ["restaurant", "eten", "maaltijd", "bestelling", "order", "foodticket",
               "via mollie", "via multisafepay", "café", "brasserie", "snackbar",
               "frituur", "thuisbezorgd"],
    confidence: 82,
  },

  // ── EXPENSE: BANKING FEES ─────────────────────────────────────────────────

  {
    slug: "bank_fees",
    name: "Bank Fees",
    type: "EXPENSE",
    merchantPatterns: [
      /kosten\s?zakelijk/i, /bankkosten/i, /rente\s?buiten\s?limiet/i,
    ],
    keywords: ["kosten zakelijk", "betalingsverkeer", "factuurnr", "bankkosten",
               "rente buiten limiet", "transfer provisie", "frais bancaires",
               "bankgebühren", "kosten gebruik"],
    trcdCodes: ["09001", "09101", "09003"],
    confidence: 88,
  },

  // ── EXPENSE: TRAVEL ────────────────────────────────────────────────────────

  {
    slug: "travel",
    name: "Travel",
    type: "EXPENSE",
    merchantPatterns: [
      /ryanair/i, /easyjet/i, /\btransavia\b/i, /\bvueling\b/i, /\bwizzair\b/i,
      /airbnb/i, /booking\.com/i, /\bexpedia\b/i, /\btui\b/i,
      /tix\.nl/i, /\bhotels\.com\b/i, /\btrivago\b/i,
    ],
    keywords: ["vliegticket", "vlucht", "hotel", "accommodation", "villa",
               "vakantie", "holiday", "flight", "voyage"],
    confidence: 82,
  },

  // ── EXPENSE: SHOPPING ─────────────────────────────────────────────────────

  {
    slug: "shopping",
    name: "Shopping",
    type: "EXPENSE",
    merchantPatterns: [
      /bol\.com/i, /bolcom/i, /\bdecathlon\b/i, /startselect/i,
      /drukwerkdeal/i, /\bnike\b/i,
      /zalando/i, /\bzara\b/i, /\bh\s*&\s*m\b/i, /hennes\s*(en|und|et|&)\s*mauritz/i,
      /coolblue/i, /media\s*markt/i, /\bikea\b/i, /primark/i,
      /\bnespresso\b/i, /\buniqlo\b/i, /\bmango\b/i,
      /leroy\s*merlin/i,
      /amazon(?!\s*web)/i, /\bamzn\b/i,
      /\bkidizz\b/i, /kidsplaza/i, /123inkt/i, /riverty/i,
      /bedden\s?online/i, /anna[\s-]?sleep/i,
    ],
    keywords: ["bestelling", "order", "aankoop", "winkel", "shop", "kaufen", "acheter",
               "commande", "livraison"],
    confidence: 82,
  },

  // ── EXPENSE: DIGITAL ENTERTAINMENT / GAMING ───────────────────────────────

  {
    slug: "digital_entertainment",
    name: "Digital & Entertainment",
    type: "EXPENSE",
    merchantPatterns: [
      /startselect/i, /\bgame/i, /playstation|psn/i, /\bxbox\b/i, /\bsteam\b/i,
      /\bnintendo\b/i, /\bepic\s*games\b/i, /\bea\s*(sports|play)?\b/i,
      /\btwitch\b/i,
    ],
    keywords: ["game", "gaming", "play", "entertainment", "digital code",
               "playstation", "xbox", "nintendo"],
    confidence: 82,
  },

  // ── EXPENSE: LOANS / DEBT ─────────────────────────────────────────────────

  {
    slug: "loans",
    name: "Loans & Debt",
    type: "EXPENSE",
    merchantExact: ["interbank", "demmenie + van dorp financial services b.v.", "ddfs"],
    merchantPatterns: [/interbank/i, /demmenie/i, /\bddfs\b/i],
    keywords: ["termijn", "lening", "schuld", "afbetaling", "declaratie", "crédit", "darlehen"],
    confidence: 85,
  },

  // ── EXPENSE: CHARITY / DONATIONS ─────────────────────────────────────────
  // Removed generic /stichting/i — too many false positives (e.g. Bitvavo)

  {
    slug: "charity",
    name: "Charity",
    type: "EXPENSE",
    merchantPatterns: [
      /vier\s?voeters/i, /save\s?the\s?children/i,
      /plan\s?nederland/i, /doneeractie/i, /rode\s?kruis/i, /unicef/i,
      /\bwwf\b/i, /\bamnesty\b/i, /\bgreenpeace\b/i,
      /\boxfam\b/i, /artsen\s*(zonder\s*grenzen|without\s*borders)/i,
      /\bmsa\b/i,  // Médecins Sans Frontières
    ],
    keywords: ["donatie", "schenking", "gift", "don", "spende", "goed doel"],
    confidence: 80,
  },

  // ── EXPENSE: SUBSCRIPTIONS (catch-all) ───────────────────────────────────
  // Apple, Netflix, Spotify, Microsoft have dedicated high-confidence rules above.
  // This rule handles remaining subscription services at lower confidence.

  {
    slug: "subscriptions",
    name: "Subscriptions",
    type: "EXPENSE",
    merchantPatterns: [
      /\bflexado\b/i, /\byouvia\b/i, /\bpzn\b/i,
      /\bdropbox\b/i, /\blastpass\b/i, /\b1password\b/i,
    ],
    keywords: ["abonnement", "subscription", "doorlopende incasso", "maandelijks", "jaarlijks",
               "lizenz", "abo", "forfait"],
    trcdCodes: ["01018"],
    confidence: 75,
  },

  // ── EXPENSE: MONEY TRANSFERS ─────────────────────────────────────────────

  {
    slug: "remittance",
    name: "International Transfer",
    type: "EXPENSE",
    merchantPatterns: [/western\s?union/i, /transferwise/i, /\bwise\b/i, /moneygram/i],
    keywords: ["western union", "transferwise", "international transfer", "transfer provisie"],
    trcdCodes: ["00500", "09003"],
    confidence: 85,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORIZATION ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export interface TransactionForCategorization {
  counterpartyName: string | null;
  counterpartyIban: string | null;
  description: string | null;
  reference: string | null;
  signedAmount: number;
  rawData?: Record<string, unknown>;
}

/**
 * Suggest categories for a transaction. Returns up to 3 suggestions ranked by confidence.
 */
export function suggestCategories(
  tx: TransactionForCategorization,
  userRules: UserLearningRule[] = []
): CategorySuggestion[] {
  const suggestions: CategorySuggestion[] = [];

  const name = (tx.counterpartyName ?? "").toLowerCase().trim();
  const normalizedName = normalizeMerchant(tx.counterpartyName ?? "").toLowerCase();
  const desc = (tx.description ?? "").toLowerCase();
  const ref = (tx.reference ?? "").toLowerCase();
  const iban = tx.counterpartyIban ? normalizeIban(tx.counterpartyIban) : "";

  // Extract merchant from messy KBC/ING descriptions (strips KAARTBETALING NR etc.)
  const descExtracted = extractMerchantFromDescription(desc);
  const descNormalized = normalizeMerchant(descExtracted).toLowerCase();

  const searchText = `${name} ${normalizedName} ${desc} ${ref} ${descNormalized}`;

  // ── 1. User rules (confidence=100) ─────────────────────────────────────
  for (const rule of userRules) {
    let match = false;
    if (rule.counterpartyIban && iban && normalizeIban(rule.counterpartyIban) === iban) match = true;
    if (!match && rule.merchantNameContains && name.includes(rule.merchantNameContains.toLowerCase())) match = true;
    if (!match && rule.descriptionContains && searchText.includes(rule.descriptionContains.toLowerCase())) match = true;

    if (match) {
      suggestions.push({
        categorySlug: rule.categorySlug,
        categoryName: rule.categoryName,
        confidence: 100,
        matchedBy: "user_rule",
        matchedValue: rule.merchantNameContains ?? rule.counterpartyIban ?? rule.descriptionContains ?? "",
      });
    }
  }

  if (suggestions.some((s) => s.confidence >= 100)) {
    return suggestions.slice(0, 1);
  }

  // ── 2-6. Built-in rules ─────────────────────────────────────────────────
  for (const rule of BUILT_IN_RULES) {
    let matched = false;
    let matchedBy: MatchReason = "keyword_description";
    let matchedValue = "";
    let confidence = rule.confidence;

    // IBAN prefix match
    if (!matched && rule.ibanPrefixes && iban) {
      for (const prefix of rule.ibanPrefixes) {
        if (iban.startsWith(prefix)) {
          matched = true;
          matchedBy = "iban_exact";
          matchedValue = iban;
          confidence = Math.max(confidence, 93);
          break;
        }
      }
    }

    // Merchant exact match (raw name, normalized name, extracted description normalized)
    if (!matched && rule.merchantExact) {
      for (const exact of rule.merchantExact) {
        const exactLower = exact.toLowerCase();
        if (
          name === exactLower || name.includes(exactLower) ||
          normalizedName === exactLower || normalizedName.includes(exactLower) ||
          descNormalized === exactLower || descNormalized.includes(exactLower)
        ) {
          matched = true;
          matchedBy = "merchant_exact";
          matchedValue = exact;
          confidence = Math.max(confidence, 88);
          break;
        }
      }
    }

    // Merchant pattern (raw name, normalized name, description, extracted description)
    if (!matched && rule.merchantPatterns) {
      for (const pattern of rule.merchantPatterns) {
        if (
          pattern.test(name) ||
          pattern.test(normalizedName) ||
          pattern.test(desc) ||
          pattern.test(descExtracted)
        ) {
          matched = true;
          matchedBy = "merchant_pattern";
          matchedValue = pattern.source;
          confidence = Math.max(confidence, 78);
          break;
        }
      }
    }

    // Transaction code (MT940/CAMT)
    if (!matched && rule.trcdCodes) {
      const rawTrcd = (tx.rawData?.trcdCode as string | undefined) ?? "";
      for (const code of rule.trcdCodes) {
        if (rawTrcd.includes(code)) {
          matched = true;
          matchedBy = "transaction_code";
          matchedValue = code;
          confidence = Math.max(confidence, 70);
          break;
        }
      }
    }

    // Keyword in full search text
    if (!matched && rule.keywords) {
      for (const keyword of rule.keywords) {
        if (searchText.includes(keyword.toLowerCase())) {
          matched = true;
          matchedBy = "keyword_description";
          matchedValue = keyword;
          break;
        }
      }
    }

    if (matched) {
      suggestions.push({
        categorySlug: rule.slug,
        categoryName: rule.name,
        confidence,
        matchedBy,
        matchedValue,
      });
    }
  }

  // Sort by confidence descending, deduplicate by slug
  const seen = new Set<string>();
  return suggestions
    .sort((a, b) => b.confidence - a.confidence)
    .filter((s) => {
      if (seen.has(s.categorySlug)) return false;
      seen.add(s.categorySlug);
      return true;
    })
    .slice(0, 3);
}

/**
 * Get the best (highest confidence) category suggestion.
 * Returns null if no suggestion above the threshold.
 */
export function getBestCategory(
  tx: TransactionForCategorization,
  userRules: UserLearningRule[] = [],
  minConfidence = 70
): CategorySuggestion | null {
  const suggestions = suggestCategories(tx, userRules);
  const best = suggestions[0];
  return best && best.confidence >= minConfidence ? best : null;
}

/**
 * Bulk-categorize a batch of transactions.
 * Returns map of index → best suggestion.
 */
export function bulkCategorize(
  transactions: TransactionForCategorization[],
  userRules: UserLearningRule[] = [],
  minConfidence = 70
): Map<number, CategorySuggestion> {
  const result = new Map<number, CategorySuggestion>();
  for (let i = 0; i < transactions.length; i++) {
    const best = getBestCategory(transactions[i], userRules, minConfidence);
    if (best) result.set(i, best);
  }
  return result;
}
