/**
 * Merchant name normalizer.
 *
 * Converts raw bank statement merchant strings into clean canonical names.
 * Used to improve rule matching in the categorization engine.
 *
 * Examples:
 *   "ALBERT HEIJN 1234"        → "Albert Heijn"
 *   "AH TO GO"                 → "Albert Heijn"
 *   "OPENAI *CHATGPT"          → "OpenAI"
 *   "AMAZON EU SARL"           → "Amazon"
 *   "STARBUCKS AMSTERDAM 0092" → "Starbucks"
 *   "APPLE.COM/BILL"           → "Apple"
 *   "KAARTBETALING LIDL"       → "Lidl"
 */

// ─────────────────────────────────────────────────────────────────────────────
// ALIAS MAP  (pattern → canonical name, evaluated top-to-bottom)
// ─────────────────────────────────────────────────────────────────────────────

const MERCHANT_ALIASES: [RegExp, string][] = [
  // ── Albert Heijn ──────────────────────────────────────────────────────────
  [/\bah\s*(to[\s-]?go|xl|jan[\s-]?linders|supermarkt)?\b/i, "Albert Heijn"],
  [/albert[\s-]?heijn/i, "Albert Heijn"],

  // ── Jumbo ─────────────────────────────────────────────────────────────────
  [/\bjumbo\b/i, "Jumbo"],

  // ── Plus supermarkt ───────────────────────────────────────────────────────
  [/\bplus\s*(supermarkt)?\b/i, "Plus"],

  // ── Dirk ──────────────────────────────────────────────────────────────────
  [/\bdirk\b/i, "Dirk"],

  // ── Spar ──────────────────────────────────────────────────────────────────
  [/\bspar\b/i, "Spar"],

  // ── Lidl ──────────────────────────────────────────────────────────────────
  [/\blidl\b/i, "Lidl"],

  // ── Aldi ──────────────────────────────────────────────────────────────────
  [/\baldi\b/i, "Aldi"],

  // ── Carrefour ─────────────────────────────────────────────────────────────
  [/carrefour/i, "Carrefour"],

  // ── Colruyt ───────────────────────────────────────────────────────────────
  [/colruyt/i, "Colruyt"],

  // ── Delhaize ──────────────────────────────────────────────────────────────
  [/delhaize/i, "Delhaize"],

  // ── Cora ──────────────────────────────────────────────────────────────────
  [/\bcora\b/i, "Cora"],

  // ── Netto ─────────────────────────────────────────────────────────────────
  [/\bnetto\b/i, "Netto"],

  // ── Picnic ────────────────────────────────────────────────────────────────
  [/\bpicnic\b/i, "Picnic"],

  // ── Tesco ─────────────────────────────────────────────────────────────────
  [/\btesco\b/i, "Tesco"],

  // ── Sainsbury's ───────────────────────────────────────────────────────────
  [/sainsbury/i, "Sainsbury's"],

  // ── Asda ──────────────────────────────────────────────────────────────────
  [/\basda\b/i, "Asda"],

  // ── Waitrose ──────────────────────────────────────────────────────────────
  [/waitrose/i, "Waitrose"],

  // ── Morrisons ─────────────────────────────────────────────────────────────
  [/morrisons/i, "Morrisons"],

  // ── M&S / Marks & Spencer ─────────────────────────────────────────────────
  [/marks\s*(and|&)\s*spencer/i, "M&S"],
  [/\bm\s*&\s*s\b/i, "M&S"],

  // ── REWE ──────────────────────────────────────────────────────────────────
  [/\brewe\b/i, "REWE"],

  // ── Edeka ─────────────────────────────────────────────────────────────────
  [/\bedeka\b/i, "Edeka"],

  // ── Penny ─────────────────────────────────────────────────────────────────
  [/\bpenny\b/i, "Penny"],

  // ── Kaufland ──────────────────────────────────────────────────────────────
  [/kaufland/i, "Kaufland"],

  // ── Auchan ────────────────────────────────────────────────────────────────
  [/\bauchan\b/i, "Auchan"],

  // ── Monoprix ──────────────────────────────────────────────────────────────
  [/monoprix/i, "Monoprix"],

  // ── Intermarché ───────────────────────────────────────────────────────────
  [/intermarche|intermarché/i, "Intermarché"],

  // ── Leclerc ───────────────────────────────────────────────────────────────
  [/\bleclerc\b/i, "Leclerc"],

  // ── Casino ────────────────────────────────────────────────────────────────
  [/\bcasino\b/i, "Casino"],

  // ── Apple (before generic patterns) ──────────────────────────────────────
  [/apple\.com\/bill/i, "Apple"],
  [/apple\.com/i, "Apple"],
  [/\bitunes\b/i, "Apple"],
  [/\bicloud\.com\b/i, "Apple"],
  [/apple\s*(distribution|inc|retail|services|store|tv|music|pay|asia|europe|id)?\b/i, "Apple"],

  // ── OpenAI / ChatGPT ──────────────────────────────────────────────────────
  [/openai/i, "OpenAI"],
  [/chatgpt/i, "OpenAI"],

  // ── Adobe ─────────────────────────────────────────────────────────────────
  [/\badobe\b/i, "Adobe"],

  // ── Microsoft ─────────────────────────────────────────────────────────────
  [/microsoft/i, "Microsoft"],
  [/\bmsft\b/i, "Microsoft"],

  // ── Figma ─────────────────────────────────────────────────────────────────
  [/\bfigma\b/i, "Figma"],

  // ── Notion ────────────────────────────────────────────────────────────────
  [/\bnotion\b/i, "Notion"],

  // ── Slack ─────────────────────────────────────────────────────────────────
  [/\bslack\b/i, "Slack"],

  // ── Vercel ────────────────────────────────────────────────────────────────
  [/\bvercel\b/i, "Vercel"],

  // ── GitHub ────────────────────────────────────────────────────────────────
  [/github/i, "GitHub"],

  // ── AWS ───────────────────────────────────────────────────────────────────
  [/amazon\s*web\s*services/i, "AWS"],
  [/\baws\b/i, "AWS"],

  // ── Google ────────────────────────────────────────────────────────────────
  [/\bgoogle\b/i, "Google"],

  // ── Shopify ───────────────────────────────────────────────────────────────
  [/shopify/i, "Shopify"],

  // ── Amazon (after AWS check) ──────────────────────────────────────────────
  [/amazon/i, "Amazon"],
  [/\bamz\*|amzn/i, "Amazon"],

  // ── Bol.com ───────────────────────────────────────────────────────────────
  [/bol\.?com/i, "Bol.com"],
  [/\bbolcom\b/i, "Bol.com"],

  // ── Zalando ───────────────────────────────────────────────────────────────
  [/zalando/i, "Zalando"],

  // ── Zara ──────────────────────────────────────────────────────────────────
  [/\bzara\b/i, "Zara"],

  // ── H&M ───────────────────────────────────────────────────────────────────
  [/\bh\s*&?\s*m\b/i, "H&M"],
  [/hennes\s*(en|und|et|&)\s*mauritz/i, "H&M"],

  // ── Coolblue ──────────────────────────────────────────────────────────────
  [/coolblue/i, "Coolblue"],

  // ── MediaMarkt ────────────────────────────────────────────────────────────
  [/media\s*markt/i, "MediaMarkt"],

  // ── IKEA ──────────────────────────────────────────────────────────────────
  [/\bikea\b/i, "IKEA"],

  // ── Primark ───────────────────────────────────────────────────────────────
  [/primark/i, "Primark"],

  // ── Decathlon ─────────────────────────────────────────────────────────────
  [/decathlon/i, "Decathlon"],

  // ── Nike ──────────────────────────────────────────────────────────────────
  [/\bnike\b/i, "Nike"],

  // ── Uniqlo ────────────────────────────────────────────────────────────────
  [/\buniqlo\b/i, "Uniqlo"],

  // ── Mango ─────────────────────────────────────────────────────────────────
  [/\bmango\b/i, "Mango"],

  // ── Shell ─────────────────────────────────────────────────────────────────
  [/\bshell\b/i, "Shell"],

  // ── BP ────────────────────────────────────────────────────────────────────
  [/\bbp\b/i, "BP"],

  // ── Esso ──────────────────────────────────────────────────────────────────
  [/\besso\b/i, "Esso"],

  // ── TotalEnergies ─────────────────────────────────────────────────────────
  [/totalenergies/i, "TotalEnergies"],
  [/\btotal\b/i, "TotalEnergies"],

  // ── Q8 ────────────────────────────────────────────────────────────────────
  [/\bq8\b/i, "Q8"],

  // ── Dats 24 ───────────────────────────────────────────────────────────────
  [/dats\s*24/i, "Dats 24"],

  // ── Uber Eats ─────────────────────────────────────────────────────────────
  [/uber\s*eats/i, "Uber Eats"],

  // ── Uber ──────────────────────────────────────────────────────────────────
  [/\buber\b/i, "Uber"],

  // ── Bolt ──────────────────────────────────────────────────────────────────
  [/\bbolt\s*(eu|ride|app)?\b/i, "Bolt"],

  // ── Deliveroo ─────────────────────────────────────────────────────────────
  [/deliveroo/i, "Deliveroo"],

  // ── Thuisbezorgd / Takeaway ───────────────────────────────────────────────
  [/thuisbezorgd/i, "Thuisbezorgd.nl"],
  [/\btakeaway\b/i, "Thuisbezorgd.nl"],

  // ── Wolt ──────────────────────────────────────────────────────────────────
  [/\bwolt\b/i, "Wolt"],

  // ── Just Eat ──────────────────────────────────────────────────────────────
  [/just\s*eat/i, "Just Eat"],

  // ── Gorillas ──────────────────────────────────────────────────────────────
  [/gorillas/i, "Gorillas"],

  // ── Getir ─────────────────────────────────────────────────────────────────
  [/\bgetir\b/i, "Getir"],

  // ── Starbucks ─────────────────────────────────────────────────────────────
  [/starbucks/i, "Starbucks"],

  // ── McDonald's ────────────────────────────────────────────────────────────
  [/mcdonald/i, "McDonald's"],
  [/\bmcd\b/i, "McDonald's"],

  // ── Burger King ───────────────────────────────────────────────────────────
  [/burger[\s-]?king/i, "Burger King"],
  [/\bbk\b/i, "Burger King"],

  // ── KFC ───────────────────────────────────────────────────────────────────
  [/\bkfc\b/i, "KFC"],

  // ── Subway ────────────────────────────────────────────────────────────────
  [/\bsubway\b/i, "Subway"],

  // ── Domino's ──────────────────────────────────────────────────────────────
  [/domino/i, "Domino's"],

  // ── Pizza Hut ─────────────────────────────────────────────────────────────
  [/pizza\s*hut/i, "Pizza Hut"],

  // ── Costa Coffee ──────────────────────────────────────────────────────────
  [/costa\s*coffee/i, "Costa Coffee"],

  // ── Pret A Manger ─────────────────────────────────────────────────────────
  [/pret\s*a\s*manger/i, "Pret"],
  [/\bpret\b/i, "Pret"],

  // ── NS (Dutch rail) ───────────────────────────────────────────────────────
  [/\bns\s*(reizigers|international|hispeed)?\b/i, "NS"],

  // ── OV-chipkaart / OVPAY ──────────────────────────────────────────────────
  [/ovpay/i, "OV-chipkaart"],
  [/ov[\s-]?chip/i, "OV-chipkaart"],

  // ── De Lijn ───────────────────────────────────────────────────────────────
  [/\bde\s*lijn\b/i, "De Lijn"],

  // ── STIB / MIVB ───────────────────────────────────────────────────────────
  [/\bstib\b|\bmivb\b/i, "STIB/MIVB"],

  // ── Deutsche Bahn ─────────────────────────────────────────────────────────
  [/deutsche\s*bahn/i, "Deutsche Bahn"],
  [/\bdb\s*(bahn|fernverkehr|regio)?\b/i, "Deutsche Bahn"],

  // ── SNCB / NMBS ───────────────────────────────────────────────────────────
  [/\bsncb\b/i, "SNCB"],
  [/\bnmbs\b/i, "SNCB"],

  // ── SNCF ──────────────────────────────────────────────────────────────────
  [/\bsncf\b/i, "SNCF"],

  // ── Flixbus ───────────────────────────────────────────────────────────────
  [/flixbus/i, "FlixBus"],

  // ── BlaBlaCar ─────────────────────────────────────────────────────────────
  [/blablacar/i, "BlaBlaCar"],

  // ── Netflix ───────────────────────────────────────────────────────────────
  [/netflix/i, "Netflix"],

  // ── Spotify ───────────────────────────────────────────────────────────────
  [/spotify/i, "Spotify"],

  // ── Disney+ ───────────────────────────────────────────────────────────────
  [/disney/i, "Disney+"],

  // ── Videoland ─────────────────────────────────────────────────────────────
  [/videoland/i, "Videoland"],

  // ── RTL+ ──────────────────────────────────────────────────────────────────
  [/\brtl\+/i, "RTL+"],

  // ── Streamz ───────────────────────────────────────────────────────────────
  [/streamz/i, "Streamz"],

  // ── Deezer ────────────────────────────────────────────────────────────────
  [/deezer/i, "Deezer"],

  // ── YouTube Premium ───────────────────────────────────────────────────────
  [/youtube\s*premium/i, "YouTube Premium"],

  // ── Twitch ────────────────────────────────────────────────────────────────
  [/\btwitch\b/i, "Twitch"],

  // ── PlayStation ───────────────────────────────────────────────────────────
  [/playstation|psn/i, "PlayStation"],

  // ── Xbox ──────────────────────────────────────────────────────────────────
  [/\bxbox\b/i, "Xbox"],

  // ── Steam ─────────────────────────────────────────────────────────────────
  [/\bsteam\b/i, "Steam"],

  // ── Odido ─────────────────────────────────────────────────────────────────
  [/\bodido\b/i, "Odido"],

  // ── KPN ───────────────────────────────────────────────────────────────────
  [/\bkpn\b/i, "KPN"],

  // ── Ziggo ─────────────────────────────────────────────────────────────────
  [/\bziggo\b/i, "Ziggo"],

  // ── Tele2 ─────────────────────────────────────────────────────────────────
  [/\btele2\b/i, "Tele2"],

  // ── T-Mobile ──────────────────────────────────────────────────────────────
  [/t[\s-]?mobile/i, "T-Mobile"],

  // ── Vodafone ──────────────────────────────────────────────────────────────
  [/vodafone/i, "Vodafone"],

  // ── Proximus ──────────────────────────────────────────────────────────────
  [/proximus/i, "Proximus"],

  // ── Telenet ───────────────────────────────────────────────────────────────
  [/telenet/i, "Telenet"],

  // ── Orange ────────────────────────────────────────────────────────────────
  [/\borange\b/i, "Orange"],

  // ── Free (FR) ─────────────────────────────────────────────────────────────
  [/\bfree\s*(mobile|telecom)?\b/i, "Free"],

  // ── SFR ───────────────────────────────────────────────────────────────────
  [/\bsfr\b/i, "SFR"],

  // ── Bouygues ──────────────────────────────────────────────────────────────
  [/bouygues/i, "Bouygues"],

  // ── O2 ────────────────────────────────────────────────────────────────────
  [/\bo2\b/i, "O2"],

  // ── EE (UK) ───────────────────────────────────────────────────────────────
  [/\bee\s*(mobile|telecom|network)?\b/i, "EE"],

  // ── BT ────────────────────────────────────────────────────────────────────
  [/\bbt\s*(group|broadband|internet|sport)?\b/i, "BT"],

  // ── Eneco ─────────────────────────────────────────────────────────────────
  [/\beneco\b/i, "Eneco"],

  // ── Vattenfall ────────────────────────────────────────────────────────────
  [/vattenfall/i, "Vattenfall"],

  // ── Greenchoice ───────────────────────────────────────────────────────────
  [/greenchoice/i, "Greenchoice"],

  // ── Nuon ──────────────────────────────────────────────────────────────────
  [/\bnuon\b/i, "Nuon"],

  // ── Essent ────────────────────────────────────────────────────────────────
  [/\bessent\b/i, "Essent"],

  // ── Oxxio ─────────────────────────────────────────────────────────────────
  [/\boxxio\b/i, "Oxxio"],

  // ── Fluvius ───────────────────────────────────────────────────────────────
  [/fluvius/i, "Fluvius"],

  // ── Luminus ───────────────────────────────────────────────────────────────
  [/luminus/i, "Luminus"],

  // ── Electrabel ────────────────────────────────────────────────────────────
  [/electrabel/i, "Electrabel"],

  // ── EDF ───────────────────────────────────────────────────────────────────
  [/\bedf\b/i, "EDF"],

  // ── Engie ─────────────────────────────────────────────────────────────────
  [/\bengie\b/i, "Engie"],
  [/gaz\s*de\s*france/i, "Engie"],

  // ── E.ON ──────────────────────────────────────────────────────────────────
  [/\be\.?on\b/i, "E.ON"],

  // ── RWE ───────────────────────────────────────────────────────────────────
  [/\brwe\b/i, "RWE"],

  // ── British Gas ───────────────────────────────────────────────────────────
  [/british\s*gas/i, "British Gas"],

  // ── Bitvavo ───────────────────────────────────────────────────────────────
  [/bitvavo/i, "Bitvavo"],

  // ── DEGIRO ────────────────────────────────────────────────────────────────
  [/degiro/i, "DEGIRO"],

  // ── eToro ─────────────────────────────────────────────────────────────────
  [/\betoro\b/i, "eToro"],

  // ── Binance ───────────────────────────────────────────────────────────────
  [/binance/i, "Binance"],

  // ── Coinbase ──────────────────────────────────────────────────────────────
  [/coinbase/i, "Coinbase"],

  // ── Kraken ────────────────────────────────────────────────────────────────
  [/\bkraken\b/i, "Kraken"],

  // ── Flatex ────────────────────────────────────────────────────────────────
  [/flatex/i, "Flatex"],

  // ── BinckBank ─────────────────────────────────────────────────────────────
  [/binckbank/i, "BinckBank"],

  // ── Trading 212 ───────────────────────────────────────────────────────────
  [/trading\s*212/i, "Trading 212"],

  // ── Nationale Nederlanden / NN ────────────────────────────────────────────
  [/nationale[\s-]?nederlanden/i, "Nationale Nederlanden"],
  [/\bnn\s*group\b/i, "Nationale Nederlanden"],

  // ── Centraal Beheer ───────────────────────────────────────────────────────
  [/centraal[\s-]?beheer/i, "Centraal Beheer"],

  // ── Achmea ────────────────────────────────────────────────────────────────
  [/\bachmea\b/i, "Achmea"],

  // ── Aegon ─────────────────────────────────────────────────────────────────
  [/\baegon\b/i, "Aegon"],

  // ── AXA ───────────────────────────────────────────────────────────────────
  [/\baxa\b/i, "AXA"],

  // ── Allianz ───────────────────────────────────────────────────────────────
  [/allianz/i, "Allianz"],

  // ── Generali ──────────────────────────────────────────────────────────────
  [/\bgenerali\b/i, "Generali"],

  // ── Aviva ─────────────────────────────────────────────────────────────────
  [/\baviva\b/i, "Aviva"],

  // ── Kruidvat ──────────────────────────────────────────────────────────────
  [/kruidvat/i, "Kruidvat"],

  // ── BENU ──────────────────────────────────────────────────────────────────
  [/\bbenu\b/i, "BENU"],

  // ── DA Drogist ────────────────────────────────────────────────────────────
  [/\bda\s*(drogist)?\b/i, "DA"],

  // ── Boots ─────────────────────────────────────────────────────────────────
  [/\bboots\b/i, "Boots"],

  // ── Superdrug ─────────────────────────────────────────────────────────────
  [/superdrug/i, "Superdrug"],

  // ── Stripe ────────────────────────────────────────────────────────────────
  [/stripe/i, "Stripe"],

  // ── PayPal ────────────────────────────────────────────────────────────────
  [/paypal/i, "PayPal"],

  // ── Wise (TransferWise) ───────────────────────────────────────────────────
  [/transferwise/i, "Wise"],
  [/\bwise\b/i, "Wise"],

  // ── Revolut ───────────────────────────────────────────────────────────────
  [/revolut/i, "Revolut"],

  // ── Bunq ──────────────────────────────────────────────────────────────────
  [/\bbunq\b/i, "Bunq"],

  // ── Nespresso ─────────────────────────────────────────────────────────────
  [/nespresso/i, "Nespresso"],

  // ── Leroy Merlin ──────────────────────────────────────────────────────────
  [/leroy\s*merlin/i, "Leroy Merlin"],

  // ── Gamma ─────────────────────────────────────────────────────────────────
  [/\bgamma\b/i, "Gamma"],

  // ── Praxis ────────────────────────────────────────────────────────────────
  [/\bpraxis\b/i, "Praxis"],
];

// ─────────────────────────────────────────────────────────────────────────────
// LEGAL SUFFIXES to strip (after alias matching fails)
// ─────────────────────────────────────────────────────────────────────────────

const LEGAL_SUFFIX_PATTERN =
  /\s+(b\.?v\.?|n\.?v\.?|s\.?a\.?|s\.?a\.?r\.?l\.?|gmbh|ltd\.?|plc\.?|inc\.?|llc\.?|ag\.?|oy|ab|as|cvba|vzw|bvba|srl|spa|kft|aps|se)\s*$/i;

// Strip card payment noise prefixes before alias matching
const CARD_NOISE_PREFIX =
  /^(kaartbetaling|kaartbet|bancontact|maestro|betaling via|debit\s*card|credit\s*card|pos\s*|ovpay|ov[\s-]?betaling|apple\s*pay|google\s*pay|contactloos|pinbetaling)\s*(?:nr\.?\s*[\d*]+)?\s*/i;

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalize a raw bank statement merchant name into a clean canonical form.
 *
 * Returns the canonical name if an alias matched, otherwise returns a cleaned
 * version of the input (stripped of store numbers, legal suffixes, extra spaces).
 */
export function normalizeMerchant(raw: string): string {
  if (!raw || !raw.trim()) return "";

  const trimmed = raw.trim();

  // Strip card-payment noise prefixes first so "KAARTBETALING ALBERT HEIJN" → "ALBERT HEIJN"
  const denoised = trimmed.replace(CARD_NOISE_PREFIX, "").trim();
  const toTest = denoised || trimmed;

  // Check alias map (most specific wins — order matters)
  for (const [pattern, canonical] of MERCHANT_ALIASES) {
    if (pattern.test(toTest)) {
      return canonical;
    }
  }

  // No alias matched — apply generic cleanup
  let cleaned = toTest
    // Strip asterisk-separated suffixes like "OPENAI *CHATGPT" or "AMZN *PRIME"
    .replace(/\s*\*.*$/, "")
    // Strip legal entity suffixes
    .replace(LEGAL_SUFFIX_PATTERN, "")
    // Strip trailing store/location codes: digits, or 2–4 uppercase letters that look like a code
    .replace(/\s+\d+$/, "")
    .replace(/\s+[A-Z]{2,4}\d*$/, "")
    .trim();

  // Title-case the result
  return toTitleCase(cleaned);
}

/**
 * Normalize and return lowercase — convenient for case-insensitive comparisons.
 */
export function normalizeMerchantLower(raw: string): string {
  return normalizeMerchant(raw).toLowerCase();
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function toTitleCase(str: string): string {
  if (!str) return str;
  return str
    .toLowerCase()
    .replace(/(?:^|\s)\S/g, (c) => c.toUpperCase());
}
