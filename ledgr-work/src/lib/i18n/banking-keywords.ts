/**
 * Banking keyword normalizer — NL / EN / FR / DE
 *
 * Maps raw transaction descriptions to canonical category slugs.
 * Validated against:
 *   - ING NL  MT940 / CAMT.053 / CSV  (308 real transactions)
 *   - KBC BE  CSV  (1730+ real transactions)
 *   - MT940 AU NPP reference file
 *
 * Priority: lower number checked first (more specific → higher priority).
 */

export type BankingCategory =
  | "own_account_transfer"
  | "savings_account"
  | "instant_transfer"
  | "direct_debit"
  | "card_payment"
  | "standing_order"
  | "salary"
  | "taxes"
  | "subscription"
  | "bank_fee"
  | "refund"
  | "investment_rounding"
  | "credit_card_settlement"
  | "transfer";

export type SupportedBankingLocale = "nl" | "en" | "fr" | "de";

interface KeywordEntry {
  category: BankingCategory;
  priority: number;
  keywords: Record<SupportedBankingLocale, string[]>;
}

const KEYWORD_TABLE: KeywordEntry[] = [
  {
    category: "own_account_transfer",
    priority: 1,
    keywords: {
      nl: [
        "zakelijke oranje spaarrekening",
        "van zakelijke oranje",
        "naar zakelijke oranje",
        "eigen rekening",
      ],
      en: ["own account", "internal transfer", "between accounts"],
      fr: ["virement entre comptes", "compte interne", "transfert interne"],
      de: ["eigene überweisung", "umbuchung eigenkonto", "internes konto"],
    },
  },
  {
    category: "investment_rounding",
    priority: 2,
    keywords: {
      nl: ["afronden en beleggen", "afrekening fondsen", "beleggingsfonds"],
      en: ["investment rounding", "round-up investment", "fund settlement"],
      fr: ["arrondi placement", "investissement automatique", "règlement fonds"],
      de: ["anlage-rundung", "fonds-abrechnung", "investment-rundung"],
    },
  },
  {
    category: "savings_account",
    priority: 3,
    keywords: {
      nl: ["spaarrekening", "spaarekening", "spaargeld", "rente spaar", "oranje spaarrekening"],
      en: ["savings account", "savings transfer", "interest savings"],
      fr: ["compte épargne", "livret épargne", "intérêts épargne", "livret a"],
      de: ["sparkonto", "tagesgeld", "festgeld", "sparzinsen"],
    },
  },
  {
    category: "instant_transfer",
    priority: 4,
    keywords: {
      nl: ["instantoverboeking", "instant betaling", "real-time betaling"],
      en: ["instant payment", "instant transfer", "faster payment", "fps"],
      fr: ["virement instantané", "paiement instantané", "vir inst"],
      de: ["echtzeitüberweisung", "instant-überweisung", "sofortüberweisung sepa"],
    },
  },
  {
    category: "direct_debit",
    priority: 5,
    keywords: {
      nl: [
        "automatische incasso",
        "incasso",
        "europese domiciliëring",
        "europese domiciliering", // unaccented — real ING MT940 variant
        "doorlopende incasso",
        "domiciliëring",
        "sepa incasso",
      ],
      en: ["direct debit", "dd payment", "sepa direct debit", "mandate"],
      fr: ["prélèvement automatique", "prélèvement", "domiciliation", "mandat sepa"],
      de: ["lastschrift", "sepa-lastschrift", "einzugsermächtigung", "bankeinzug", "abbuchung"],
    },
  },
  {
    category: "card_payment",
    priority: 6,
    keywords: {
      nl: [
        "betaling via maestro",
        "betaling via bancontact",
        "betaling via debit mastercard",
        "betaling via",
        "maestro",
        "bancontact",
        "pin-betaling",
        "contactloos",
        "visa debit",
      ],
      en: ["card payment", "card purchase", "pos payment", "contactless", "visa purchase", "mastercard purchase"],
      fr: ["paiement carte", "carte bancaire", "règlement carte", "débit carte", "sans contact", "cb "],
      de: ["kartenzahlung", "ec-zahlung", "girocard", "maestro zahlung", "visa zahlung", "mastercard zahlung", "kontaktlos"],
    },
  },
  {
    category: "standing_order",
    priority: 7,
    keywords: {
      nl: ["doorlopende betalingsopdracht", "periodieke overboeking", "automatische overboeking"],
      en: ["standing order", "recurring payment", "scheduled transfer"],
      fr: ["virement permanent", "ordre permanent", "virement récurrent"],
      de: ["dauerauftrag", "dauerüberweisung", "wiederkehrende überweisung"],
    },
  },
  {
    category: "salary",
    priority: 8,
    keywords: {
      nl: ["salaris", "loon", "verloning", "netto loon", "vakantiegeld", "overboeking salaris", "overboeking deel salaris"],
      en: ["salary", "wages", "payroll", "net pay", "paycheck"],
      fr: ["salaire", "rémunération", "net à payer", "virement salaire", "bulletin de salaire"],
      de: ["gehalt", "lohn", "gehaltszahlung", "nettolohn", "urlaubsgeld", "weihnachtsgeld", "gehaltsüberweisung"],
    },
  },
  {
    category: "taxes",
    priority: 9,
    keywords: {
      nl: ["belastingdienst", "belasting", "btw", "aanslag", "inkomstenbelasting", "vennootschapsbelasting"],
      en: ["tax payment", "vat payment", "income tax", "corporation tax", "hmrc", "council tax"],
      fr: ["impôts", "impot", "tva", "taxe", "dgfip", "trésor public", "direction générale des finances"],
      de: ["finanzamt", "steuer", "umsatzsteuer", "einkommensteuer", "körperschaftsteuer", "gewerbesteuer", "steuerzahlung"],
    },
  },
  {
    category: "subscription",
    priority: 10,
    keywords: {
      nl: ["abonnement", "maandelijkse bijdrage", "jaarlijkse bijdrage", "lidmaatschap"],
      en: ["subscription", "monthly subscription", "annual subscription", "membership fee", "recurring charge"],
      fr: ["abonnement", "cotisation", "mensualité", "forfait mensuel"],
      de: ["abonnement", "abo-zahlung", "mitgliedsbeitrag", "monatliche gebühr", "jahresbeitrag"],
    },
  },
  {
    category: "bank_fee",
    priority: 11,
    keywords: {
      nl: ["kosten zakelijk", "bankkosten", "rente buiten limiet", "betalingsverkeer", "servicekosten", "beheerkosten", "transactiekosten"],
      en: ["bank charges", "account fee", "transaction fee", "service charge", "overdraft fee", "monthly fee"],
      fr: ["frais bancaires", "frais de tenue de compte", "commission bancaire", "agios", "frais de virement", "cotisation carte"],
      de: ["bankgebühren", "kontoführungsgebühr", "überweisungsgebühr", "transaktionsgebühr", "zinsen kontokorrent", "dispozinsen"],
    },
  },
  {
    category: "refund",
    priority: 12,
    keywords: {
      nl: ["terugboeking", "terugbetaling", "restitutie", "correctie", "storno", "rtrn", "geretourneerd", "retour"],
      en: ["refund", "reversal", "chargeback", "return payment", "cancelled payment", "money back"],
      fr: ["remboursement", "avoir", "annulation paiement", "rejet", "retour virement", "contre-passation"],
      de: ["rückerstattung", "rückbuchung", "stornierung", "rücküberweisung", "widerruf", "rücklastschrift", "retoure"],
    },
  },
  {
    category: "credit_card_settlement",
    priority: 13,
    keywords: {
      nl: ["afrekening mastercard", "afrekening creditcard", "creditcardafrekening", "visa betaling"],
      en: ["credit card payment", "credit card statement", "credit card settlement", "amex payment"],
      fr: ["règlement carte de crédit", "remboursement carte", "prélèvement carte crédit"],
      de: ["kreditkartenabrechnung", "kreditkartenzahlung", "visa-abrechnung", "mastercard-abrechnung"],
    },
  },
  {
    category: "transfer",
    priority: 99, // lowest — catch-all
    keywords: {
      nl: ["overboeking", "overschrijving", "instantoverschrijving", "online bankieren"],
      en: ["transfer", "bank transfer", "wire transfer", "bacs", "chaps"],
      fr: ["virement", "virement bancaire", "virement en ligne", "vir sepa"],
      de: ["überweisung", "banküberweisung", "sepa-überweisung", "online-überweisung"],
    },
  },
];

/**
 * Detect banking category from a raw description string.
 * Locale-specific keywords are checked first, then cross-locale.
 * Returns null when no match found.
 */
export function normalizeBankingKeyword(
  description: string,
  locale: SupportedBankingLocale = "en"
): BankingCategory | null {
  if (!description) return null;
  const lower = description.toLowerCase().trim();
  const sorted = [...KEYWORD_TABLE].sort((a, b) => a.priority - b.priority);

  for (const entry of sorted) {
    const primary = entry.keywords[locale] ?? [];
    const secondary = (Object.entries(entry.keywords) as [SupportedBankingLocale, string[]][])
      .filter(([lang]) => lang !== locale)
      .flatMap(([, kws]) => kws);

    for (const kw of [...primary, ...secondary]) {
      if (lower.includes(kw.toLowerCase())) return entry.category;
    }
  }
  return null;
}

/** Map a banking category to a transaction type for P&L accounting. */
export function bankingCategoryToType(
  cat: BankingCategory
): "INCOME" | "EXPENSE" | "TRANSFER" | "REFUND" {
  switch (cat) {
    case "own_account_transfer":
    case "savings_account":
    case "instant_transfer":
    case "standing_order":
    case "transfer":
      return "TRANSFER";
    case "refund":
      return "REFUND";
    case "salary":
      return "INCOME";
    default:
      return "EXPENSE";
  }
}
