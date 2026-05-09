/**
 * LEDGR European Bank Profile System
 *
 * Modular bank profiles encoding every known quirk for:
 * - ING Netherlands
 * - KBC Belgium
 * - Bunq Netherlands
 * - Rabobank Netherlands
 * - ABN AMRO Netherlands
 * - Revolut
 * - Deutsche Bank Germany
 * - BNP Paribas France
 * - Triodos Netherlands
 * - Sparkasse Germany
 * - Belfius Belgium
 *
 * Each profile is self-contained: delimiter, encoding, date format,
 * decimal format, IBAN pattern, column mapping presets, quirks.
 */

export type DecimalFormat = "comma" | "dot";
export type DateFormat =
  | "YYYYMMDD"       // 20251030  (ING CSV)
  | "DD-MM-YYYY"     // 30-10-2025 (KBC BE)
  | "DD/MM/YYYY"     // 30/10/2025 (BNP FR)
  | "DD.MM.YYYY"     // 30.10.2025 (Deutsche Bank)
  | "DD.MM.YY"       // 30.10.25   (Sparkasse)
  | "MM/DD/YYYY"     // US format
  | "YYYY-MM-DD"     // ISO 8601   (Bunq, Rabobank)
  | "DDMMYYYY"       // 30102025
  | "YYMMDD";        // 251030     (MT940)

export type Delimiter = ";" | "," | "\t" | "|";

export interface BankColumnMapping {
  date: string;
  amount?: string;
  debitAmount?: string;
  creditAmount?: string;
  creditDebit?: string;
  description?: string;
  counterpartyName?: string;
  counterpartyIban?: string;
  reference?: string;
  balance?: string;
  transactionType?: string;
}

export interface OwnAccountPattern {
  /** Detect as own-account transfer (→ TRANSFER type) */
  nameContains?: string[];
  /** Internal ID not an IBAN (e.g. D85909804 for ING Spaarrekening) */
  internalId?: string[];
  /** Description patterns */
  descriptionContains?: string[];
}

export interface BankProfile {
  id: string;
  name: string;
  country: "NL" | "BE" | "DE" | "FR" | "GB" | "OTHER";
  /** BIC/SWIFT codes */
  bics: string[];
  /** IBAN prefix(es) for this bank */
  ibanPrefixes: string[];
  /** File formats this bank typically exports */
  supportedFormats: ("csv" | "xlsx" | "mt940" | "camt053" | "pdf")[];
  csv?: {
    delimiter: Delimiter;
    encoding: "utf-8" | "utf-8-bom" | "iso-8859-1" | "windows-1252";
    quoteChar: '"' | "'";
    hasHeaderRow: boolean;
    dateFormat: DateFormat;
    decimalFormat: DecimalFormat;
    thousandsSeparator?: "." | "," | " " | "";
    columnMapping: BankColumnMapping;
    /** Known column header aliases */
    headerAliases?: Record<string, string[]>;
  };
  mt940?: {
    decimalFormat: DecimalFormat;   // MT940 amounts use COMMA in NL, DOT elsewhere
    dateFormat: DateFormat;
    encoding: "utf-8" | "iso-8859-1";
    hasStructuredRemittance: boolean;
  };
  camt053?: {
    decimalFormat: DecimalFormat;   // CAMT always uses DOT (ISO standard)
    namespaces: string[];
  };
  /** Patterns for detecting own-account transfers */
  ownAccountPatterns: OwnAccountPattern;
  /** Known quirks for this bank */
  quirks: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// BANK PROFILES
// ─────────────────────────────────────────────────────────────────────────────

export const BANK_PROFILES: Record<string, BankProfile> = {

  // ── ING Netherlands ───────────────────────────────────────────────────────
  "ing-nl": {
    id: "ing-nl",
    name: "ING Netherlands",
    country: "NL",
    bics: ["INGBNL2A", "INGBNL2AXXX"],
    ibanPrefixes: ["NL", "INGB"],
    supportedFormats: ["csv", "mt940", "camt053", "pdf"],
    csv: {
      delimiter: ";",
      encoding: "utf-8",
      quoteChar: '"',
      hasHeaderRow: true,
      dateFormat: "YYYYMMDD",
      decimalFormat: "comma",
      thousandsSeparator: "",
      columnMapping: {
        date: "Datum",
        amount: "Bedrag (EUR)",
        creditDebit: "Af Bij",
        description: "Mededelingen",
        counterpartyName: "Naam / Omschrijving",
        counterpartyIban: "Tegenrekening",
        reference: "Kenmerk",
        balance: "Saldo na mutatie",
        transactionType: "Mutatiesoort",
      },
      headerAliases: {
        "Naam / Omschrijving": ["Naam/Omschrijving", "Naam / Omschrijving"],
        "Bedrag (EUR)": ["Bedrag (EUR)", "Bedrag"],
        "Af Bij": ["Af Bij", "Af/Bij", "D/C"],
      },
    },
    mt940: {
      decimalFormat: "comma",   // CRITICAL: ING MT940 uses COMMA decimal
      dateFormat: "YYMMDD",
      encoding: "utf-8",
      hasStructuredRemittance: true,
    },
    camt053: {
      decimalFormat: "dot",     // CAMT always dot per ISO 20022
      namespaces: [
        "urn:iso:std:iso:20022:tech:xsd:camt.053.001.02",
        "urn:iso:std:iso:20022:tech:xsd:camt.053.001.06",
        "urn:iso:std:iso:20022:tech:xsd:camt.053.001.08",
      ],
    },
    ownAccountPatterns: {
      nameContains: ["Zakelijke Oranje Spaarrekening", "Van Zakelijke oranje spaarrekening", "Naar Zakelijke oranje spaarrekening"],
      internalId: ["D85909804"],
      descriptionContains: ["Zakelijke Oranje Spaarrekening"],
    },
    quirks: [
      "Zakelijke Spaarrekening has NO IBAN - appears as internal ID D85909804",
      "CSV v1 uses semicolon delimiter with Saldo and Tag columns",
      "CSV v2 uses comma delimiter without Saldo/Tag columns",
      "MT940 amounts use comma decimal (74,00), CAMT uses dot (74.00)",
      "TRCD/00370 = internal book transfer (Spaarrekening)",
      "TRCD/09001 = bank fee, TRCD/09101 = interest",
      "TRCD/01018 = direct debit (incasso)",
      "TRCD/01315 = reversed direct debit (RTRN = refund)",
      "Jah mulders / Mw JAH Mayele-Mulders = NL68INGB0684822288 (family account)",
    ],
  },

  // ── KBC Belgium ───────────────────────────────────────────────────────────
  "kbc-be": {
    id: "kbc-be",
    name: "KBC Belgium",
    country: "BE",
    bics: ["KREDBEBB", "KREDBEBXXX"],
    ibanPrefixes: ["BE"],
    supportedFormats: ["csv", "pdf"],
    csv: {
      delimiter: ";",
      encoding: "utf-8",
      quoteChar: '"',
      hasHeaderRow: true,
      dateFormat: "DD-MM-YYYY",
      decimalFormat: "comma",
      thousandsSeparator: " ",   // CRITICAL: space as thousands separator (1 200,00)
      columnMapping: {
        date: "Datum",
        amount: "Bedrag",
        creditDebit: "Valuta",
        description: "Omschrijving",
        counterpartyName: "Naam tegenpartij",
        counterpartyIban: "Rekening tegenpartij",
        reference: "Mededeling",
      },
    },
    ownAccountPatterns: {
      descriptionContains: [
        "AFRONDEN EN BELEGGEN NAAR",
        "INSTANTOVERSCHRIJVING NAAR",
      ],
      nameContains: ["Mayele Jessy", "MAYELE JESSY"],
    },
    quirks: [
      "PDF export has amounts with SPACE as thousands separator: 1 200,00 = 1200.00",
      "BETALING VIA BANCONTACT = card payment (expense)",
      "BETALING VIA DEBIT MASTERCARD = card payment (expense)",
      "INSTANTOVERSCHRIJVING VAN = incoming instant transfer",
      "INSTANTOVERSCHRIJVING NAAR = outgoing instant transfer",
      "OVERSCHRIJVING VAN = incoming bank transfer",
      "AFRONDEN EN BELEGGEN NAAR = rounding investment (often transfer)",
      "EUROPESE DOMICILIERING = SEPA direct debit (subscription)",
      "BIC KREDBEBB, KREDBEBXXX",
      "Account BE08736029512013 = KBC current account",
      "BE98 7460 1526 2693 = Mayele Jessy secondary account (own)",
    ],
  },

  // ── Bunq Netherlands ──────────────────────────────────────────────────────
  "bunq-nl": {
    id: "bunq-nl",
    name: "Bunq",
    country: "NL",
    bics: ["BUNQNL2A", "BUNQNL2AXXX"],
    ibanPrefixes: ["NL91BUNQ", "NL"],
    supportedFormats: ["csv", "mt940"],
    csv: {
      delimiter: ",",
      encoding: "utf-8",
      quoteChar: '"',
      hasHeaderRow: true,
      dateFormat: "YYYY-MM-DD",
      decimalFormat: "dot",
      thousandsSeparator: "",
      columnMapping: {
        date: "Date",
        amount: "Amount",
        creditDebit: "Type",
        description: "Description",
        counterpartyName: "Counterparty Name",
        counterpartyIban: "Counterparty IBAN",
        reference: "Payment Reference",
        balance: "Balance After Transaction",
      },
    },
    ownAccountPatterns: {},
    quirks: [
      "Uses dot decimal (international format)",
      "Date format YYYY-MM-DD (ISO 8601)",
      "Amount can be negative for debits",
      "Type column: PAYMENT or INCOME or TRANSFER",
    ],
  },

  // ── Rabobank Netherlands ───────────────────────────────────────────────────
  "rabobank-nl": {
    id: "rabobank-nl",
    name: "Rabobank",
    country: "NL",
    bics: ["RABONL2U", "RABONL2UXXX"],
    ibanPrefixes: ["NL"],
    supportedFormats: ["csv", "mt940", "camt053"],
    csv: {
      delimiter: ",",
      encoding: "utf-8",
      quoteChar: '"',
      hasHeaderRow: true,
      dateFormat: "YYYY-MM-DD",
      decimalFormat: "dot",
      thousandsSeparator: "",
      columnMapping: {
        date: "Datum",
        amount: "Bedrag",
        creditDebit: "Af of Bij",
        description: "Omschrijving",
        counterpartyName: "Naam tegenpartij",
        counterpartyIban: "Rekening tegenpartij",
        reference: "Kenmerk",
        balance: "Saldo na boeking",
        transactionType: "Soort betaling",
      },
    },
    mt940: {
      decimalFormat: "comma",
      dateFormat: "YYMMDD",
      encoding: "utf-8",
      hasStructuredRemittance: true,
    },
    camt053: {
      decimalFormat: "dot",
      namespaces: ["urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"],
    },
    ownAccountPatterns: {},
    quirks: [
      "CSV uses dot decimal (unlike ING)",
      "Af of Bij = debit/credit indicator",
    ],
  },

  // ── ABN AMRO Netherlands ──────────────────────────────────────────────────
  "abnamro-nl": {
    id: "abnamro-nl",
    name: "ABN AMRO",
    country: "NL",
    bics: ["ABNANL2A", "ABNANL2AXXX"],
    ibanPrefixes: ["NL"],
    supportedFormats: ["csv", "mt940", "camt053"],
    csv: {
      delimiter: "\t",
      encoding: "utf-8",
      quoteChar: '"',
      hasHeaderRow: false,  // ABN AMRO has NO header row!
      dateFormat: "YYYYMMDD",
      decimalFormat: "comma",
      thousandsSeparator: "",
      columnMapping: {
        // Fixed column positions (0-indexed)
        date: "0",           // col 0
        counterpartyIban: "1",
        counterpartyName: "2",
        amount: "6",         // col 6
        creditDebit: "7",    // D/C
        description: "8",
      },
    },
    mt940: {
      decimalFormat: "comma",
      dateFormat: "YYMMDD",
      encoding: "utf-8",
      hasStructuredRemittance: true,
    },
    camt053: {
      decimalFormat: "dot",
      namespaces: ["urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"],
    },
    ownAccountPatterns: {},
    quirks: [
      "CSV has NO header row - fixed column positions",
      "Tab-delimited (not semicolon)",
      "Column 7 has D/C indicator",
    ],
  },

  // ── Revolut ────────────────────────────────────────────────────────────────
  "revolut": {
    id: "revolut",
    name: "Revolut",
    country: "GB",
    bics: ["REVOLT21", "REVOGB21"],
    ibanPrefixes: ["GB", "LT"],
    supportedFormats: ["csv", "xlsx"],
    csv: {
      delimiter: ",",
      encoding: "utf-8",
      quoteChar: '"',
      hasHeaderRow: true,
      dateFormat: "YYYY-MM-DD",
      decimalFormat: "dot",
      thousandsSeparator: "",
      columnMapping: {
        date: "Started Date",
        amount: "Amount",
        creditDebit: "Type",
        description: "Description",
        counterpartyName: "Beneficiary",
        reference: "Reference",
        balance: "Balance",
        transactionType: "Type",
      },
    },
    ownAccountPatterns: {},
    quirks: [
      "Date includes time: 2025-10-30 14:32:15",
      "Type: TRANSFER, TOPUP, PAYMENT, REFUND, CARD_PAYMENT",
      "TOPUP = money added to Revolut (income from bank)",
      "Amount negative = debit, positive = credit (no separate indicator)",
      "Currency column may differ from EUR",
    ],
  },

  // ── Deutsche Bank Germany ──────────────────────────────────────────────────
  "deutschebank-de": {
    id: "deutschebank-de",
    name: "Deutsche Bank",
    country: "DE",
    bics: ["DEUTDEFFXXX", "DEUTDEDB"],
    ibanPrefixes: ["DE"],
    supportedFormats: ["csv", "mt940", "camt053"],
    csv: {
      delimiter: ";",
      encoding: "windows-1252",
      quoteChar: '"',
      hasHeaderRow: true,
      dateFormat: "DD.MM.YYYY",
      decimalFormat: "comma",
      thousandsSeparator: ".",
      columnMapping: {
        date: "Buchungstag",
        amount: "Betrag (EUR)",
        creditDebit: "Soll/Haben",
        description: "Verwendungszweck",
        counterpartyName: "Auftraggeber/Begünstigter",
        counterpartyIban: "IBAN",
        reference: "Kundenreferenz",
        balance: "Kontostand",
      },
    },
    mt940: {
      decimalFormat: "comma",
      dateFormat: "YYMMDD",
      encoding: "iso-8859-1",
      hasStructuredRemittance: false,
    },
    camt053: {
      decimalFormat: "dot",
      namespaces: ["urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"],
    },
    ownAccountPatterns: {},
    quirks: [
      "Encoding may be windows-1252 (not UTF-8)",
      "Date format DD.MM.YYYY (German style)",
      "Thousands separator is DOT, decimal is COMMA: 1.234,56",
      "Betrag negative = debit in some exports",
    ],
  },

  // ── Sparkasse Germany ──────────────────────────────────────────────────────
  "sparkasse-de": {
    id: "sparkasse-de",
    name: "Sparkasse",
    country: "DE",
    bics: [],
    ibanPrefixes: ["DE"],
    supportedFormats: ["csv", "mt940"],
    csv: {
      delimiter: ";",
      encoding: "windows-1252",
      quoteChar: '"',
      hasHeaderRow: true,
      dateFormat: "DD.MM.YY",
      decimalFormat: "comma",
      thousandsSeparator: ".",
      columnMapping: {
        date: "Buchungstag",
        amount: "Betrag",
        description: "Buchungstext",
        counterpartyName: "Beguenstigter/Zahlungspflichtiger",
        counterpartyIban: "Kontonummer/IBAN",
        reference: "Glaeubiger ID",
      },
    },
    mt940: {
      decimalFormat: "comma",
      dateFormat: "YYMMDD",
      encoding: "iso-8859-1",
      hasStructuredRemittance: false,
    },
    ownAccountPatterns: {},
    quirks: [
      "Date format may be DD.MM.YY (2-digit year)",
      "Betrag can be negative for debits",
      "Encoding windows-1252 common",
    ],
  },

  // ── BNP Paribas France ────────────────────────────────────────────────────
  "bnp-fr": {
    id: "bnp-fr",
    name: "BNP Paribas",
    country: "FR",
    bics: ["BNPAFRPP", "BNPAFRPPXXX"],
    ibanPrefixes: ["FR"],
    supportedFormats: ["csv", "mt940"],
    csv: {
      delimiter: ";",
      encoding: "iso-8859-1",
      quoteChar: '"',
      hasHeaderRow: true,
      dateFormat: "DD/MM/YYYY",
      decimalFormat: "comma",
      thousandsSeparator: " ",   // French space separator
      columnMapping: {
        date: "Date",
        amount: "Montant",
        description: "Libellé",
        counterpartyName: "Tiers",
        reference: "Référence",
        balance: "Solde",
      },
    },
    mt940: {
      decimalFormat: "comma",
      dateFormat: "YYMMDD",
      encoding: "iso-8859-1",
      hasStructuredRemittance: false,
    },
    ownAccountPatterns: {},
    quirks: [
      "French thousands separator is SPACE: 1 234,56",
      "Encoding iso-8859-1",
      "Date format DD/MM/YYYY",
      "Montant negative = debit",
    ],
  },

  // ── Triodos Netherlands ────────────────────────────────────────────────────
  "triodos-nl": {
    id: "triodos-nl",
    name: "Triodos",
    country: "NL",
    bics: ["TRIONL2U"],
    ibanPrefixes: ["NL"],
    supportedFormats: ["csv", "mt940"],
    csv: {
      delimiter: ";",
      encoding: "utf-8",
      quoteChar: '"',
      hasHeaderRow: true,
      dateFormat: "YYYY-MM-DD",
      decimalFormat: "dot",
      thousandsSeparator: "",
      columnMapping: {
        date: "Datum",
        amount: "Bedrag",
        creditDebit: "Bij/Af",
        description: "Omschrijving",
        counterpartyName: "Naam tegenpartij",
        counterpartyIban: "IBAN tegenpartij",
      },
    },
    ownAccountPatterns: {},
    quirks: [
      "Bij/Af reversed from ING (Bij=credit, Af=debit — same meaning)",
      "Uses ISO date format YYYY-MM-DD",
      "Dot decimal",
    ],
  },

  // ── Belfius Belgium ───────────────────────────────────────────────────────
  "belfius-be": {
    id: "belfius-be",
    name: "Belfius",
    country: "BE",
    bics: ["GKCCBEBB"],
    ibanPrefixes: ["BE"],
    supportedFormats: ["csv", "mt940", "camt053"],
    csv: {
      delimiter: ";",
      encoding: "utf-8",
      quoteChar: '"',
      hasHeaderRow: true,
      dateFormat: "DD-MM-YYYY",
      decimalFormat: "comma",
      thousandsSeparator: ".",
      columnMapping: {
        date: "Datum",
        amount: "Bedrag",
        description: "Omschrijving",
        counterpartyName: "Naam tegenpartij",
        counterpartyIban: "Rekening tegenpartij",
        reference: "Vrije mededeling",
      },
    },
    mt940: {
      decimalFormat: "comma",
      dateFormat: "YYMMDD",
      encoding: "utf-8",
      hasStructuredRemittance: true,
    },
    camt053: {
      decimalFormat: "dot",
      namespaces: ["urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"],
    },
    ownAccountPatterns: {},
    quirks: ["Amounts: dot thousands, comma decimal: 1.234,56"],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// DETECTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect the most likely bank profile for a file based on IBAN, BIC, or content fingerprints.
 */
export function detectBankProfile(params: {
  iban?: string;
  bic?: string;
  firstLine?: string;
  headers?: string[];
}): BankProfile | null {
  const { iban, bic, firstLine, headers } = params;

  // Match by BIC
  if (bic) {
    const bicUpper = bic.toUpperCase();
    for (const profile of Object.values(BANK_PROFILES)) {
      if (profile.bics.some((b) => bicUpper.startsWith(b))) return profile;
    }
  }

  // Match by IBAN prefix + known bank code
  if (iban) {
    // ING NL: NL__INGB
    if (/^NL\d{2}INGB/.test(iban)) return BANK_PROFILES["ing-nl"];
    // KBC BE: BE
    if (/^BE\d{2}736/.test(iban)) return BANK_PROFILES["kbc-be"];
    // Rabobank
    if (/^NL\d{2}RABO/.test(iban)) return BANK_PROFILES["rabobank-nl"];
    // ABN AMRO
    if (/^NL\d{2}ABNA/.test(iban)) return BANK_PROFILES["abnamro-nl"];
    // Bunq
    if (/^NL\d{2}BUNQ/.test(iban)) return BANK_PROFILES["bunq-nl"];
    // Belfius
    if (/^BE\d{2}068/.test(iban)) return BANK_PROFILES["belfius-be"];
    // Triodos
    if (/^NL\d{2}TRIO/.test(iban)) return BANK_PROFILES["triodos-nl"];
  }

  // Match by CSV headers fingerprint
  if (headers) {
    const h = headers.map((s) => s.toLowerCase());
    if (h.includes("af bij") || h.includes("af/bij")) {
      if (h.includes("saldo na mutatie")) return BANK_PROFILES["ing-nl"];
      return BANK_PROFILES["ing-nl"];
    }
    if (h.includes("buchungstag") || h.includes("betrag")) return BANK_PROFILES["deutschebank-de"];
    if (h.includes("libellé") || h.includes("montant")) return BANK_PROFILES["bnp-fr"];
    if (h.includes("bij/af")) return BANK_PROFILES["triodos-nl"];
  }

  // Match by first line content
  if (firstLine) {
    if (firstLine.includes("INGBNL2A") || firstLine.includes("NL82INGB")) return BANK_PROFILES["ing-nl"];
    if (firstLine.includes("KREDBEBB")) return BANK_PROFILES["kbc-be"];
    if (firstLine.includes("RABONL2U")) return BANK_PROFILES["rabobank-nl"];
    if (firstLine.includes("ABNANL2A")) return BANK_PROFILES["abnamro-nl"];
    if (firstLine.includes("BUNQNL2A")) return BANK_PROFILES["bunq-nl"];
  }

  return null;
}

/**
 * Check if a description/name/id indicates an own-account transfer.
 * Validated against real ING NL files (D85909804 = Zakelijke Spaarrekening).
 */
export function isOwnAccountTransfer(
  profile: BankProfile,
  params: {
    counterpartyId?: string;
    counterpartyName?: string;
    description?: string;
  }
): boolean {
  const { ownAccountPatterns } = profile;
  const id = (params.counterpartyId ?? "").toUpperCase();
  const name = (params.counterpartyName ?? "").toLowerCase();
  const desc = (params.description ?? "").toLowerCase();

  if (ownAccountPatterns.internalId?.some((p) => id === p.toUpperCase())) return true;
  if (ownAccountPatterns.nameContains?.some((p) => name.includes(p.toLowerCase()))) return true;
  if (ownAccountPatterns.descriptionContains?.some((p) => desc.includes(p.toLowerCase()))) return true;

  return false;
}
