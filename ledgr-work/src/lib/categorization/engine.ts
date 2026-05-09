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

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface CategorySuggestion {
  categorySlug: string;        // e.g. "groceries", "telecom"
  categoryName: string;
  confidence: number;          // 0–100
  matchedBy: MatchReason;
  matchedValue: string;        // what exactly triggered this match
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
  /** IBAN prefixes or exact IBANs that always match (e.g. LU89751 = PayPal) */
  ibanPrefixes?: string[];
  /** Exact merchant name strings (case-insensitive) */
  merchantExact?: string[];
  /** Regex patterns against merchant name */
  merchantPatterns?: RegExp[];
  /** Keywords to find anywhere in description+name (multilingual) */
  keywords?: string[];
  /** ING TRCD codes from MT940 */
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
// BUILT-IN RULES — validated against real ING NL & KBC BE files
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
    merchantExact: ["bolcom bv", "bol.com"],
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

  // ── EXPENSE: GROCERIES ────────────────────────────────────────────────────

  {
    slug: "groceries",
    name: "Groceries",
    type: "EXPENSE",
    merchantPatterns: [
      /\bah\b/i, /albert\s?heijn/i, /ah\s?jan\s?linders/i,
      /\blidl\b/i, /\baldi\b/i, /\bjumbo\b/i, /\bplus\b/i,
      /\bcarrefour\b/i, /\bdirk\b/i, /\bnah\b/i,
      /\bdelhaize\b/i, /\bdistri\b/i, /\bcora\b/i,
      /\bcolruyt\b/i, /\bnetto\b/i, /\bspar\b/i,
      /kaufland/i,
    ],
    keywords: ["supermarkt", "boodschappen", "groceries"],
    confidence: 85,
  },

  // ── EXPENSE: FUEL / GAS ──────────────────────────────────────────────────

  {
    slug: "fuel",
    name: "Fuel",
    type: "EXPENSE",
    merchantPatterns: [
      /\bq8\b/i, /\bshell\b/i, /\bbp\b/i, /\besso\b/i,
      /\bavia\b/i, /\bdats\s?24\b/i, /\botal\b/i,
      /bruno\s?service/i, /\bpetrol/i,
      /service\s?station/i,
    ],
    keywords: ["brandstof", "tanken", "benzine", "diesel", "fuel", "carburant", "kraftstoff"],
    confidence: 85,
  },

  // ── EXPENSE: TELECOM ─────────────────────────────────────────────────────

  {
    slug: "telecom",
    name: "Telecom",
    type: "EXPENSE",
    merchantExact: ["odido netherlands b.v.", "odido", "mobile vikings", "proximus", "telenet", "orange"],
    merchantPatterns: [
      /\bodido\b/i, /\bkpn\b/i, /\btelfort\b/i, /\bt-mobile\b/i,
      /\bvodafone\b/i, /\btelenet\b/i, /\bproximus\b/i,
      /\borange\b/i, /\bbase\b/i,
      /odido\s?shop/i,
    ],
    ibanPrefixes: ["NL12COBA"],  // Odido IBAN prefix
    keywords: ["telefoon", "internet", "abonnement", "telecom", "mobile", "gsm"],
    confidence: 88,
  },

  // ── EXPENSE: ONLINE PAYMENTS / PAYPAL ────────────────────────────────────

  {
    slug: "online_payments",
    name: "Online Payments",
    type: "EXPENSE",
    merchantExact: ["paypal europe s.a.r.l. et cie s.c.a", "paypal (europe) s.a r.l. et cie, s.c.a."],
    merchantPatterns: [/paypal/i],
    ibanPrefixes: [
      "LU89751",   // PayPal Luxembourg EUR
      "DE88500",   // PayPal Germany (fallback)
    ],
    keywords: ["paypal", "/paypal"],
    confidence: 95,
  },

  // ── EXPENSE: SUBSCRIPTIONS ────────────────────────────────────────────────

  {
    slug: "subscriptions",
    name: "Subscriptions",
    type: "EXPENSE",
    merchantPatterns: [
      /\bgamma\b/i,       // gamma.app (AI tool)
      /\bflexado\b/i,     // HR platform
      /\byouvia\b/i,      // insurance/admin
      /\bpzn\b/i,         // factuurdesk
      /netflix/i, /spotify/i, /amazon\s?prime/i, /disney/i,
      /microsoft/i, /google/i, /apple/i, /adobe/i, /dropbox/i,
    ],
    keywords: ["abonnement", "subscription", "doorlopende incasso", "maandelijks", "jaarlijks",
               "lizenz", "abo", "forfait"],
    trcdCodes: ["01018"],  // direct debit = often subscription
    confidence: 70,
  },

  // ── EXPENSE: HEALTH INSURANCE ────────────────────────────────────────────

  {
    slug: "health_insurance",
    name: "Health Insurance",
    type: "EXPENSE",
    merchantExact: ["solidaris limburg"],
    merchantPatterns: [/solidaris/i, /ziekenfonds/i, /mutualit/i, /krankenkasse/i, /assurance\s?maladie/i],
    keywords: ["ziekenfonds", "mutualiteit", "bijdrage", "aanvullende bijdrage", "aanvull bijdr", "mutualite"],
    ibanPrefixes: ["BE34363"],  // Solidaris IBAN
    confidence: 90,
  },

  // ── EXPENSE: TAXES ────────────────────────────────────────────────────────

  {
    slug: "taxes",
    name: "Taxes",
    type: "EXPENSE",
    merchantExact: ["belastingdienst"],
    merchantPatterns: [/belastingdienst/i, /fisc/i, /\brvz\b/i, /gemeente\s/i, /administration\s?fiscale/i, /finanzamt/i],
    ibanPrefixes: ["NL86INGB0002"],  // Belastingdienst IBAN
    keywords: ["belasting", "btw", "tax", "aanslagbiljet", "tva", "steuer", "impôt"],
    confidence: 90,
  },

  // ── EXPENSE: GOVERNMENT / MUNICIPALITY ───────────────────────────────────

  {
    slug: "government",
    name: "Government",
    type: "EXPENSE",
    merchantPatterns: [/gemeente\s/i, /stad\s/i, /\bovj\b/i, /\btozo\b/i, /\bcoa\b/i],
    keywords: ["gemeente", "stadsdeel", "overheid", "maastricht", "tozo", "debiteur"],
    ibanPrefixes: ["NL66BNGH"],  // BNG (Gemeente bank)
    confidence: 80,
  },

  // ── EXPENSE: FOOD DELIVERY / RESTAURANTS ─────────────────────────────────

  {
    slug: "restaurants",
    name: "Restaurants & Food",
    type: "EXPENSE",
    merchantPatterns: [
      /\bkfc\b/i, /\bmcdonald/i, /\bbk\b/i, /burger\s?king/i,
      /takeaway/i, /thuisbezorgd/i, /deliveroo/i, /uber\s?eats/i,
      /foodticket/i, /eethuis/i, /yama\s?maaseik/i,
      /frituur/i, /kempervennen/i,
    ],
    keywords: ["restaurant", "eten", "maaltijd", "bestelling", "order", "foodticket", "via mollie", "via multisafepay"],
    confidence: 80,
  },

  // ── EXPENSE: BANKING FEES ─────────────────────────────────────────────────

  {
    slug: "bank_fees",
    name: "Bank Fees",
    type: "EXPENSE",
    merchantPatterns: [/kosten\s?zakelijk/i, /bankkosten/i, /rente\s?buiten\s?limiet/i],
    keywords: ["kosten zakelijk", "betalingsverkeer", "factuurnr", "bankkosten", "rente buiten limiet",
               "transfer provisie", "frais bancaires", "bankgebühren"],
    trcdCodes: ["09001", "09101", "09003"],
    confidence: 88,
  },

  // ── EXPENSE: TRAVEL ────────────────────────────────────────────────────────

  {
    slug: "travel",
    name: "Travel",
    type: "EXPENSE",
    merchantPatterns: [/ryanair/i, /\bns\b/i, /\bdb\b/i, /sncf/i, /airbnb/i, /booking\.com/i, /tix\.nl/i],
    keywords: ["vliegticket", "treinkaartje", "vlucht", "hotel", "accommodation", "villa portugal"],
    confidence: 82,
  },

  // ── EXPENSE: SHOPPING ─────────────────────────────────────────────────────

  {
    slug: "shopping",
    name: "Shopping",
    type: "EXPENSE",
    merchantPatterns: [
      /bol\.com/i, /bolcom/i, /\bdecathlon\b/i, /startselect/i,
      /drukwerkdeal/i, /tricksy/i, /wonderwolk/i, /riverty/i,
      /\bnike\b/i, /bedden\s?online/i, /anna-sleep/i, /kidsplaza/i,
      /123inkt/i, /roost\s?buitenkoken/i,
    ],
    keywords: ["bestelling", "order", "aankoop", "winkel", "shop", "kaufen", "acheter"],
    confidence: 72,
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

  {
    slug: "charity",
    name: "Charity",
    type: "EXPENSE",
    merchantPatterns: [
      /stichting/i, /vier\s?voeters/i, /save\s?the\s?children/i,
      /plan\s?nederland/i, /doneeractie/i, /rode\s?kruis/i, /unicef/i,
    ],
    keywords: ["donatie", "schenking", "gift", "don", "spende", "goed doel", "bijdrage"],
    confidence: 80,
  },

  // ── EXPENSE: EDUCATION / GAMING / DIGITAL ─────────────────────────────────

  {
    slug: "digital_entertainment",
    name: "Digital & Entertainment",
    type: "EXPENSE",
    merchantPatterns: [/startselect/i, /\bgame/i, /playstation/i, /xbox/i, /steam/i],
    keywords: ["game", "gaming", "play", "entertainment", "digital code"],
    confidence: 75,
  },

  // ── EXPENSE: MONEY TRANSFERS ─────────────────────────────────────────────

  {
    slug: "remittance",
    name: "International Transfer",
    type: "EXPENSE",
    merchantPatterns: [/western\s?union/i, /transferwise/i, /wise/i, /moneygram/i],
    keywords: ["western union", "transferwise", "international transfer", "madeyi", "transfer provisie"],
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
  const desc = (tx.description ?? "").toLowerCase();
  const ref = (tx.reference ?? "").toLowerCase();
  const iban = tx.counterpartyIban ? normalizeIban(tx.counterpartyIban) : "";
  const searchText = `${name} ${desc} ${ref}`;

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

  // If we have a high-confidence user rule, return early
  if (suggestions.some((s) => s.confidence >= 100)) {
    return suggestions.slice(0, 1);
  }

  // ── 2-6. Built-in rules ─────────────────────────────────────────────────
  for (const rule of BUILT_IN_RULES) {
    let matched = false;
    let matchedBy: MatchReason = "keyword_description";
    let matchedValue = "";
    let confidence = rule.confidence;

    // IBAN prefix match (very high confidence)
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

    // Merchant exact match
    if (!matched && rule.merchantExact) {
      for (const exact of rule.merchantExact) {
        if (name === exact.toLowerCase() || name.includes(exact.toLowerCase())) {
          matched = true;
          matchedBy = "merchant_exact";
          matchedValue = exact;
          confidence = Math.max(confidence, 88);
          break;
        }
      }
    }

    // Merchant pattern
    if (!matched && rule.merchantPatterns) {
      for (const pattern of rule.merchantPatterns) {
        if (pattern.test(name) || pattern.test(desc)) {
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
          // Don't boost beyond rule confidence for keywords
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
