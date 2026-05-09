/**
 * Multilingual Column Header Detection
 *
 * Covers Dutch, German, French, English bank exports
 * and specific known bank formats.
 */

import type { ColumnMapping } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// MULTILINGUAL HEADER DICTIONARIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Each entry is [normalized_hint, priority] where priority 1 = highest.
 * Higher priority hints win ties.
 */
type HintEntry = { hint: string; priority: number };

function h(hint: string, priority = 5): HintEntry {
  return { hint: hint.toLowerCase().replace(/[\s_\-\.\/]/g, ""), priority };
}

const DATE_HINTS: HintEntry[] = [
  // High confidence — specific date column names
  h("boekingsdatum", 1),       // NL: booking date
  h("transactiedatum", 1),     // NL: transaction date
  h("buchungsdatum", 1),       // DE: booking date
  h("buchungstag", 1),         // DE: booking day
  h("dateoperation", 1),       // FR: operation date
  h("datcomptable", 1),        // FR: accounting date
  h("valuedate", 1),           // EN
  h("transactiondate", 1),     // EN
  h("bookingdate", 1),         // EN
  h("settlementdate", 1),      // EN
  // Medium confidence
  h("datum", 2),               // NL/DE: date
  h("date", 2),                // EN/FR
  h("datum", 2),               // NL
  h("valutadatum", 2),         // NL/DE: value date
  h("valeur", 2),              // FR: value date
  h("wertstellung", 2),        // DE: value date
  // Fallback
  h("dat", 8),
  h("dt", 9),
];

const AMOUNT_HINTS: HintEntry[] = [
  // High confidence
  h("bedrag", 1),              // NL: amount
  h("betrag", 1),              // DE: amount
  h("montant", 1),             // FR: amount
  h("amount", 1),              // EN
  h("transactiebedrag", 1),    // NL: transaction amount
  h("transaktionsbetrag", 1),  // DE: transaction amount
  // Medium — could also be balance column, check context
  h("afbij", 2),               // NL: debit/credit combined
  h("bijaf", 2),               // NL: credit/debit combined
  h("saldo", 3),               // NL/DE/FR/IT: balance (lower prio, might be running balance)
  h("solde", 3),               // FR: balance
  h("kontostand", 3),          // DE: account balance
  // Split columns
  h("debet", 2),               // NL: debit
  h("credit", 2),              // NL/EN/FR/DE
  h("debit", 2),               // EN
  h("sollbetrag", 2),          // DE: debit amount
  h("habenbetrag", 2),         // DE: credit amount
  h("ausgaben", 2),            // DE: expenses
  h("einnahmen", 2),           // DE: income
  h("depense", 2),             // FR: expense
  h("recette", 2),             // FR: income
];

const DEBIT_AMOUNT_HINTS: HintEntry[] = [
  h("debet", 1),
  h("debit", 1),
  h("af", 1),                  // NL: "af" (off/debit)
  h("ausgaben", 1),
  h("depense", 1),
  h("sollbetrag", 1),
  h("belastung", 1),
  h("lastschrift", 1),
  h("withdrawal", 1),
  h("paiement", 1),
];

const CREDIT_AMOUNT_HINTS: HintEntry[] = [
  h("credit", 1),
  h("bij", 1),                 // NL: "bij" (at/credit)
  h("einnahmen", 1),
  h("recette", 1),
  h("habenbetrag", 1),
  h("gutschrift", 1),
  h("deposit", 1),
  h("versement", 1),
];

const DESCRIPTION_HINTS: HintEntry[] = [
  h("omschrijving", 1),        // NL: description
  h("beschreibung", 1),        // DE: description
  h("description", 1),         // EN/FR
  h("libelle", 1),             // FR: label/description
  h("bezeichnung", 1),         // DE: designation
  h("mededeling", 1),          // NL: message
  h("mededelingen", 1),        // NL: messages
  h("betalingskenmerk", 1),    // NL: payment reference
  h("omschr", 2),              // NL: short description
  h("memo", 2),
  h("details", 2),
  h("informatie", 2),          // NL: information
  h("information", 2),         // EN
  h("informationen", 2),       // DE
  h("transactieomschrijving", 1), // NL
  h("buchungstext", 1),        // DE: booking text
  h("verwendungszweck", 1),    // DE: purpose of transfer
  h("motif", 1),               // FR: reason/motive
  h("narrative", 2),
  h("notes", 3),
  h("note", 3),
];

const COUNTERPARTY_IBAN_HINTS: HintEntry[] = [
  h("tegenrekening", 1),       // NL: counterparty account
  h("contrarekening", 1),      // NL: counter account
  h("gegenkontonummer", 1),    // DE: counter account number
  h("gegenkonto", 1),          // DE: counter account
  h("ibancontrepartie", 1),    // FR
  h("counterpartyiban", 1),    // EN
  h("receiveriban", 1),        // EN
  h("begunstigderekening", 1), // NL: beneficiary account
  h("begunstigdeiban", 1),     // NL
  h("begunstigd", 1),          // NL: beneficiary
  h("rekeningnummer", 2),      // NL: account number
  h("iban", 2),
  h("kontonummer", 2),         // DE: account number
  h("accountnumber", 2),
  h("bic", 4),                 // Lower prio — could conflict with BIC column
];

const COUNTERPARTY_NAME_HINTS: HintEntry[] = [
  h("tegenrekeninghouder", 1), // NL: account holder of counterparty
  h("tegenpartij", 1),         // NL: counterparty
  h("naam", 1),                // NL: name
  h("naambegunstigde", 1),     // NL: name of beneficiary
  h("gegenkontoinhaber", 1),   // DE: counter account holder
  h("auftraggeber", 1),        // DE: client/ordering party
  h("begunstigde", 1),         // NL: beneficiary
  h("nombeneficiaire", 1),     // FR: beneficiary name
  h("contrepartie", 1),        // FR: counterparty
  h("counterpartyname", 1),    // EN
  h("payee", 1),               // EN
  h("payer", 1),               // EN
  h("beneficiary", 1),         // EN
  h("name", 2),
  h("creditor", 2),
  h("debtor", 2),
];

const CREDIT_DEBIT_INDICATOR_HINTS: HintEntry[] = [
  h("afbij", 1),               // NL: "af/bij" combined
  h("bijaf", 1),               // NL: "bij/af" combined
  h("dc", 1),                  // generic D/C
  h("crdr", 1),
  h("creditdebit", 1),
  h("sollhaben", 1),           // DE: debit/credit indicator
  h("type", 2),
  h("sign", 2),
  h("richting", 2),            // NL: direction
  h("richtung", 2),            // DE: direction
];

const REFERENCE_HINTS: HintEntry[] = [
  h("kenmerk", 1),             // NL: reference/characteristic
  h("betalingskenmerk", 1),    // NL: payment reference
  h("referentie", 1),          // NL: reference
  h("referenz", 1),            // DE: reference
  h("referenznummer", 1),      // DE: reference number
  h("referencepaiement", 1),   // FR: payment reference
  h("reference", 1),           // EN
  h("transactionid", 1),       // EN
  h("volgnummer", 2),          // NL: sequence number
  h("laufendenummer", 2),      // DE: sequential number
  h("eref", 2),                // SEPA end-to-end reference
  h("kref", 2),                // SEPA mandate reference
];

// ─────────────────────────────────────────────────────────────────────────────
// KNOWN BANK FINGERPRINTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Specific bank export format detection by header fingerprint.
 * Returns a pre-configured ColumnMapping if recognized.
 */
interface BankProfile {
  name: string;
  requiredHeaders: string[];        // ALL must be present (normalized)
  mapping: Partial<ColumnMapping>;
}

const BANK_PROFILES: BankProfile[] = [
  {
    name: "ING NL (new format)",
    requiredHeaders: ["datum", "naam/omschrijving", "rekening", "tegenrekening", "code", "af/bij", "bedrag(eur)", "mutatiesoort", "mededelingen"],
    mapping: {
      date: "Datum",
      amount: "Bedrag (EUR)",
      description: "Mededelingen",
      counterpartyName: "Naam / Omschrijving",
      counterpartyIban: "Tegenrekening",
      creditDebit: "Af/Bij",
    },
  },
  {
    name: "ING NL (legacy)",
    requiredHeaders: ["datum", "naam", "rekening", "tegenrekening", "code", "af/bij", "bedrag(eur)"],
    mapping: {
      date: "Datum",
      amount: "Bedrag (EUR)",
      counterpartyName: "Naam",
      counterpartyIban: "Tegenrekening",
      creditDebit: "Af/Bij",
    },
  },
  {
    name: "ABN AMRO NL",
    requiredHeaders: ["accountnumber", "currency", "transactiondate", "balancedate", "interestdate", "amount", "description"],
    mapping: {
      date: "transactionDate",
      amount: "Amount",
      description: "Description",
    },
  },
  {
    name: "Rabobank NL",
    requiredHeaders: ["iban/bban", "munt", "bdatum", "rentedatum", "bedrag", "omschrijving"],
    mapping: {
      date: "Bdatum",
      amount: "Bedrag",
      description: "Omschrijving",
      counterpartyIban: "Tegenpartij IBAN/BBAN",
      counterpartyName: "Naam tegenpartij",
    },
  },
  {
    name: "Bunq NL",
    requiredHeaders: ["date", "amount", "account", "counterpart_name", "counterpart_iban", "description"],
    mapping: {
      date: "date",
      amount: "amount",
      description: "description",
      counterpartyName: "counterpart_name",
      counterpartyIban: "counterpart_iban",
    },
  },
  {
    name: "Triodos NL",
    requiredHeaders: ["datum", "omschrijving", "bedrag"],
    mapping: {
      date: "Datum",
      amount: "Bedrag",
      description: "Omschrijving",
    },
  },
  {
    name: "Deutsche Bank DE",
    requiredHeaders: ["buchungstag", "wertstellung", "auftraggeber/beguenstigter", "verwendungszweck", "betrag(eur)"],
    mapping: {
      date: "Buchungstag",
      amount: "Betrag (EUR)",
      description: "Verwendungszweck",
      counterpartyName: "Auftraggeber / Beguenstigter",
      counterpartyIban: "Kontonummer",
    },
  },
  {
    name: "Sparkasse DE",
    requiredHeaders: ["buchungstag", "valutadatum", "betrag", "glaeubiger-id", "mandatsreferenz", "glaeubigername"],
    mapping: {
      date: "Buchungstag",
      amount: "Betrag",
      counterpartyName: "Glaeubigername",
    },
  },
  {
    name: "BNP Paribas FR",
    requiredHeaders: ["date", "libelle", "debit", "credit", "details"],
    mapping: {
      date: "Date",
      debitAmount: "Debit",
      creditAmount: "Credit",
      description: "Libelle",
    },
  },

  // ── Italian banks ─────────────────────────────────────────────────────────
  {
    name: "Intesa Sanpaolo IT",
    requiredHeaders: ["data", "importo", "causale", "saldo"],
    mapping: {
      date: "Data",
      amount: "Importo",
      description: "Causale",
    },
  },
  {
    name: "UniCredit IT",
    requiredHeaders: ["data operazione", "importo", "descrizione", "saldo contabile"],
    mapping: {
      date: "Data Operazione",
      amount: "Importo",
      description: "Descrizione",
    },
  },

  // ── Spanish banks ─────────────────────────────────────────────────────────
  {
    name: "BBVA ES",
    requiredHeaders: ["fecha", "importe", "concepto", "saldo"],
    mapping: {
      date: "Fecha",
      amount: "Importe",
      description: "Concepto",
    },
  },
  {
    name: "Santander ES",
    requiredHeaders: ["fecha operacion", "importe", "concepto"],
    mapping: {
      date: "Fecha Operacion",
      amount: "Importe",
      description: "Concepto",
    },
  },

  // ── Portuguese banks ──────────────────────────────────────────────────────
  {
    name: "CGD PT",
    requiredHeaders: ["data", "valor", "descricao", "saldo"],
    mapping: {
      date: "Data",
      amount: "Valor",
      description: "Descricao",
    },
  },
  {
    name: "Millennium BCP PT",
    requiredHeaders: ["data de movimento", "montante"],
    mapping: {
      date: "Data de Movimento",
      amount: "Montante",
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// COLUMN MATCHER
// ─────────────────────────────────────────────────────────────────────────────

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[\s_\-\.\/\(\)]/g, "");
}

function matchColumnWithPriority(
  headers: string[],
  hints: HintEntry[],
  exclude: Set<string> = new Set()
): string | undefined {
  const normalizedHeaders = headers.map((h) => ({ original: h, normalized: normalizeHeader(h) }));

  let bestMatch: { header: string; priority: number } | null = null;

  for (const { hint, priority } of hints) {
    for (const { original, normalized } of normalizedHeaders) {
      if (exclude.has(original)) continue;
      if (normalized === hint || normalized.includes(hint)) {
        if (!bestMatch || priority < bestMatch.priority) {
          bestMatch = { header: original, priority };
        }
      }
    }
  }

  return bestMatch?.header;
}

// ─────────────────────────────────────────────────────────────────────────────
// BANK PROFILE DETECTION
// ─────────────────────────────────────────────────────────────────────────────

export function detectBankProfile(headers: string[]): { profile: BankProfile | null; detected: boolean } {
  const normalizedHeaders = new Set(headers.map(normalizeHeader));

  for (const profile of BANK_PROFILES) {
    const allPresent = profile.requiredHeaders.every((req) => {
      const normalizedReq = normalizeHeader(req);
      return Array.from(normalizedHeaders).some((h) => h.includes(normalizedReq) || normalizedReq.includes(h));
    });

    if (allPresent) {
      return { profile, detected: true };
    }
  }

  return { profile: null, detected: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COLUMN DETECTION
// ─────────────────────────────────────────────────────────────────────────────

export function detectColumnMapping(headers: string[]): ColumnMapping & {
  detectedBank?: string;
  hasSplitAmounts: boolean;
} {
  // ── Try known bank profile first ─────────────────────────────────────
  const { profile, detected } = detectBankProfile(headers);
  if (detected && profile) {
    // Map profile hints to actual headers (case-insensitive)
    const actualMapping: Partial<ColumnMapping> = {};
    const normalizedHeaders = headers.map((h) => ({ original: h, normalized: normalizeHeader(h) }));

    for (const [key, value] of Object.entries(profile.mapping)) {
      if (!value) continue;
      const normalizedValue = normalizeHeader(value);
      const match = normalizedHeaders.find(
        (h) => h.normalized === normalizedValue || h.original.toLowerCase() === value.toLowerCase()
      );
      (actualMapping as Record<string, string>)[key] = match?.original ?? value;
    }

    return {
      date: headers[0],
      amount: headers[1],
      ...actualMapping,
      hasSplitAmounts: !!(actualMapping.debitAmount && actualMapping.creditAmount),
      detectedBank: profile.name,
    };
  }

  // ── Generic detection ─────────────────────────────────────────────────
  const used = new Set<string>();

  const date = matchColumnWithPriority(headers, DATE_HINTS, used) ?? headers[0];
  used.add(date);

  // Check for split debit/credit columns
  const debitAmount = matchColumnWithPriority(headers, DEBIT_AMOUNT_HINTS, used);
  const creditAmount = debitAmount
    ? matchColumnWithPriority(headers, CREDIT_AMOUNT_HINTS, new Set([...used, debitAmount]))
    : undefined;

  let amount: string;
  const hasSplitAmounts = !!(debitAmount && creditAmount);

  if (hasSplitAmounts) {
    amount = debitAmount!;    // primary amount column for display, logic uses both
    used.add(debitAmount!);
    used.add(creditAmount!);
  } else {
    amount = matchColumnWithPriority(headers, AMOUNT_HINTS, used) ?? headers[1];
    used.add(amount);
  }

  const creditDebit = matchColumnWithPriority(headers, CREDIT_DEBIT_INDICATOR_HINTS, used);
  if (creditDebit) used.add(creditDebit);

  const description = matchColumnWithPriority(headers, DESCRIPTION_HINTS, used);
  if (description) used.add(description);

  const counterpartyIban = matchColumnWithPriority(headers, COUNTERPARTY_IBAN_HINTS, used);
  if (counterpartyIban) used.add(counterpartyIban);

  const counterpartyName = matchColumnWithPriority(headers, COUNTERPARTY_NAME_HINTS, used);
  if (counterpartyName) used.add(counterpartyName);

  const reference = matchColumnWithPriority(headers, REFERENCE_HINTS, used);

  return {
    date,
    amount,
    description,
    counterpartyName,
    counterpartyIban,
    reference,
    creditDebit,
    debitAmount: hasSplitAmounts ? debitAmount : undefined,
    creditAmount: hasSplitAmounts ? creditAmount : undefined,
    hasSplitAmounts,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MULTILINGUAL HEADER INTEGRATION
// Bridges the column-detector to the authoritative multilingual-headers table
// ─────────────────────────────────────────────────────────────────────────────

import { mapHeaders, detectLanguage, type CanonicalField } from "./multilingual-headers";

/** Map CanonicalField names to ColumnMapping keys */
const CANONICAL_TO_MAPPING: Partial<Record<CanonicalField, keyof ColumnMapping>> = {
  date:              "date",
  amount:            "amount",
  debitAmount:       "debitAmount",
  creditAmount:      "creditAmount",
  creditDebit:       "creditDebit",
  description:       "description",
  counterpartyName:  "counterpartyName",
  counterpartyIban:  "counterpartyIban",
  reference:         "reference",
};

/**
 * Enhanced column mapping using the full multilingual-headers dictionary.
 * Falls back to detectColumnMapping for unrecognised headers.
 * Returns the detected language as well.
 */
export function detectColumnMappingEnhanced(headers: string[]): {
  mapping: ColumnMapping & { hasSplitAmounts: boolean; detectedBank?: string };
  language: string;
  confidence: number;
} {
  // Phase 1 — try the authoritative multilingual dictionary
  const mapped = mapHeaders(headers);
  const language = detectLanguage(headers);
  const fieldsFound = Object.keys(mapped).length;

  // Need at minimum date + amount to proceed
  if (mapped.date && (mapped.amount || (mapped.debitAmount && mapped.creditAmount))) {
    const mapping: ColumnMapping & { hasSplitAmounts: boolean } = {
      date: mapped.date ?? headers[0],
      amount: mapped.amount ?? mapped.debitAmount ?? headers[1],
      hasSplitAmounts: !!(mapped.debitAmount && mapped.creditAmount),
    };

    for (const [canonical, mappingKey] of Object.entries(CANONICAL_TO_MAPPING)) {
      const raw = mapped[canonical as CanonicalField];
      if (raw && mappingKey) (mapping as unknown as Record<string, string | undefined>)[mappingKey] = raw;
    }

    return {
      mapping,
      language,
      confidence: Math.min(100, fieldsFound * 14),
    };
  }

  // Phase 2 — fall back to existing heuristic detector
  const fallback = detectColumnMapping(headers);
  return {
    mapping: fallback,
    language,
    confidence: 50,
  };
}
