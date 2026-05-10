/**
 * LEDGR Multilingual Header Dictionary
 *
 * Maps all known column header aliases → canonical field names
 * across Dutch, English, German, and French bank exports.
 *
 * Validated against real files:
 *   - ING NL CSV (Dutch, semicolon)     — "Datum", "Bedrag (EUR)", "Af Bij"
 *   - KBC BE CSV v1 (Dutch, semicolon)  — "Datum", "Bedrag", "Credit"/"Debet"
 *   - KBC BE CSV v2 (Dutch, semicolon)  — 18 columns incl. "Rekening tegenpartij"
 *   - MT940 NL/EU standard             — :60F:/:61:/:62F: tags
 *   - MT940 AU/NPP standard            — same tags, AUD currency
 *   - Deutsche Bank DE CSV             — "Buchungstag", "Betrag (EUR)"
 *   - Sparkasse DE CSV                 — "Buchungstag", "Betrag"
 *   - BNP Paribas FR CSV               — "Date", "Montant", "Libellé"
 *   - Revolut EN CSV                   — "Started Date", "Amount", "Type"
 *   - Bunq EN CSV                      — "Date", "Amount", "Type"
 *   - ABN AMRO NL (no header)          — fixed column positions
 *
 * Canonical field names (used throughout the engine):
 *   date, amount, debitAmount, creditAmount, creditDebit,
 *   balance, description, counterpartyName, counterpartyIban,
 *   reference, structuredReference, transactionType, currency, accountIban
 */

export type CanonicalField =
  | "date"
  | "valueDate"
  | "amount"
  | "debitAmount"
  | "creditAmount"
  | "creditDebit"
  | "balance"
  | "description"
  | "counterpartyName"
  | "counterpartyIban"
  | "counterpartyBic"
  | "reference"
  | "structuredReference"
  | "transactionType"
  | "currency"
  | "accountIban"
  | "accountName"
  | "statementNumber";

export type Language = "nl" | "en" | "de" | "fr" | "unknown";

/** A single header alias with its language and confidence weight */
export interface HeaderAlias {
  canonical: CanonicalField;
  language: Language;
  weight: number;  // 100=exact match known bank, 80=common alias, 60=generic
}

/**
 * Master alias table.
 * Key: lowercase, trimmed, whitespace-collapsed header string.
 * Value: canonical field + language + weight.
 *
 * Covers all 9 required field types × 4 languages (NL/EN/DE/FR)
 * plus country-specific bank aliases.
 */
export const HEADER_ALIASES: Record<string, HeaderAlias> = {

  // ── DATE ────────────────────────────────────────────────────────────────────

  // Dutch (NL/BE)
  "datum":                        { canonical: "date", language: "nl", weight: 100 },
  "boekingsdatum":                { canonical: "date", language: "nl", weight: 95 },
  "geboekt op":                   { canonical: "date", language: "nl", weight: 100 },  // ING NL PDF
  "transactiedatum":              { canonical: "date", language: "nl", weight: 90 },
  "boekdatum":                    { canonical: "date", language: "nl", weight: 90 },

  // English
  "date":                         { canonical: "date", language: "en", weight: 100 },
  "booking date":                 { canonical: "date", language: "en", weight: 95 },
  "transaction date":             { canonical: "date", language: "en", weight: 90 },
  "started date":                 { canonical: "date", language: "en", weight: 100 },  // Revolut
  "completed date":               { canonical: "date", language: "en", weight: 80 },
  "post date":                    { canonical: "date", language: "en", weight: 85 },
  "posted date":                  { canonical: "date", language: "en", weight: 85 },
  "settlement date":              { canonical: "date", language: "en", weight: 75 },

  // German
  "buchungstag":                  { canonical: "date", language: "de", weight: 100 },  // Deutsche Bank, Sparkasse
  "buchungsdatum":                { canonical: "date", language: "de", weight: 95 },
  "wertstellungstag":             { canonical: "valueDate", language: "de", weight: 90 },
  "valuta":                       { canonical: "valueDate", language: "de", weight: 80 },  // NL/BE: value date; DE: same
  "wertstellung":                 { canonical: "valueDate", language: "de", weight: 85 },

  // French
  "date d'opération":             { canonical: "date", language: "fr", weight: 95 },
  "date operation":               { canonical: "date", language: "fr", weight: 90 },
  "date de valeur":               { canonical: "valueDate", language: "fr", weight: 90 },
  "date valeur":                  { canonical: "valueDate", language: "fr", weight: 85 },

  // ── AMOUNT ──────────────────────────────────────────────────────────────────

  // Dutch (NL/BE)
  "bedrag":                       { canonical: "amount", language: "nl", weight: 100 },
  "bedrag (eur)":                 { canonical: "amount", language: "nl", weight: 100 },  // ING NL CSV
  "bedrag(eur)":                  { canonical: "amount", language: "nl", weight: 100 },
  "bedrag eur":                   { canonical: "amount", language: "nl", weight: 95 },
  "saldo":                        { canonical: "balance", language: "nl", weight: 100 },
  "saldo na mutatie":             { canonical: "balance", language: "nl", weight: 100 },  // ING NL
  "saldo na boeking":             { canonical: "balance", language: "nl", weight: 100 },  // Rabobank
  "eindsaldo":                    { canonical: "balance", language: "nl", weight: 90 },
  "beginsaldo":                   { canonical: "balance", language: "nl", weight: 85 },

  // English
  "amount":                       { canonical: "amount", language: "en", weight: 100 },
  "amount (eur)":                 { canonical: "amount", language: "en", weight: 100 },
  "amount (gbp)":                 { canonical: "amount", language: "en", weight: 100 },
  "amount (usd)":                 { canonical: "amount", language: "en", weight: 100 },
  "transaction amount":           { canonical: "amount", language: "en", weight: 90 },
  "net amount":                   { canonical: "amount", language: "en", weight: 85 },
  "balance":                      { canonical: "balance", language: "en", weight: 100 },
  "running balance":              { canonical: "balance", language: "en", weight: 95 },
  "closing balance":              { canonical: "balance", language: "en", weight: 90 },
  "balance after transaction":    { canonical: "balance", language: "en", weight: 100 },  // Bunq

  // German
  "betrag":                       { canonical: "amount", language: "de", weight: 100 },
  "betrag (eur)":                 { canonical: "amount", language: "de", weight: 100 },  // Deutsche Bank
  "umsatz":                       { canonical: "amount", language: "de", weight: 90 },
  "kontostand":                   { canonical: "balance", language: "de", weight: 100 },

  // French
  "montant":                      { canonical: "amount", language: "fr", weight: 100 },
  "montant (eur)":                { canonical: "amount", language: "fr", weight: 100 },
  "montant de l'opération":       { canonical: "amount", language: "fr", weight: 95 },
  "solde":                        { canonical: "balance", language: "fr", weight: 100 },
  "solde après opération":        { canonical: "balance", language: "fr", weight: 95 },

  // ── DEBIT / CREDIT ──────────────────────────────────────────────────────────

  // Dutch
  "af bij":                       { canonical: "creditDebit", language: "nl", weight: 100 },  // ING NL
  "af/bij":                       { canonical: "creditDebit", language: "nl", weight: 100 },
  "bij/af":                       { canonical: "creditDebit", language: "nl", weight: 100 },  // Triodos
  "debet":                        { canonical: "debitAmount", language: "nl", weight: 100 },  // KBC BE
  "credit":                       { canonical: "creditAmount", language: "nl", weight: 100 },  // KBC BE
  "af of bij":                    { canonical: "creditDebit", language: "nl", weight: 100 },  // Rabobank
  "soll/haben":                   { canonical: "creditDebit", language: "nl", weight: 60 },

  // English
  "debit":                        { canonical: "debitAmount", language: "en", weight: 100 },
  "debit amount":                 { canonical: "debitAmount", language: "en", weight: 100 },
  "credit amount":                { canonical: "creditAmount", language: "en", weight: 100 },
  "withdrawal":                   { canonical: "debitAmount", language: "en", weight: 85 },
  "deposit":                      { canonical: "creditAmount", language: "en", weight: 85 },
  "type":                         { canonical: "creditDebit", language: "en", weight: 70 },  // Bunq, Revolut

  // German
  "haben":                        { canonical: "creditAmount", language: "de", weight: 100 },
  "soll":                         { canonical: "debitAmount", language: "de", weight: 100 },
  "gutschrift":                   { canonical: "creditAmount", language: "de", weight: 90 },
  "belastung":                    { canonical: "debitAmount", language: "de", weight: 90 },

  // French
  "débit":                        { canonical: "debitAmount", language: "fr", weight: 100 },
  "crédit":                       { canonical: "creditAmount", language: "fr", weight: 100 },
  "sens":                         { canonical: "creditDebit", language: "fr", weight: 85 },

  // ── DESCRIPTION ─────────────────────────────────────────────────────────────

  // Dutch
  "omschrijving":                 { canonical: "description", language: "nl", weight: 100 },
  "naam / omschrijving":          { canonical: "description", language: "nl", weight: 100 },  // ING NL
  "naam/omschrijving":            { canonical: "description", language: "nl", weight: 100 },
  "mededeling":                   { canonical: "description", language: "nl", weight: 90 },
  "mededelingen":                 { canonical: "description", language: "nl", weight: 90 },  // ING NL
  "beschrijving":                 { canonical: "description", language: "nl", weight: 85 },
  "mutatiesoort":                 { canonical: "transactionType", language: "nl", weight: 100 },  // ING NL
  "soort betaling":               { canonical: "transactionType", language: "nl", weight: 95 },
  "rubrieknaam":                  { canonical: "transactionType", language: "nl", weight: 90 },  // KBC BE

  // English
  "description":                  { canonical: "description", language: "en", weight: 100 },
  "transaction description":      { canonical: "description", language: "en", weight: 95 },
  "narrative":                    { canonical: "description", language: "en", weight: 85 },
  "details":                      { canonical: "description", language: "en", weight: 80 },
  "memo":                         { canonical: "description", language: "en", weight: 85 },
  "payment detail":               { canonical: "description", language: "en", weight: 85 },
  "beneficiary description":      { canonical: "description", language: "en", weight: 85 },
  "transaction type":             { canonical: "transactionType", language: "en", weight: 90 },

  // German
  "verwendungszweck":             { canonical: "description", language: "de", weight: 100 },  // Deutsche Bank
  "buchungstext":                 { canonical: "description", language: "de", weight: 100 },  // Sparkasse
  "zahlungsdetails":              { canonical: "description", language: "de", weight: 90 },
  "buchungsinfo":                 { canonical: "description", language: "de", weight: 85 },

  // French
  "libellé":                      { canonical: "description", language: "fr", weight: 100 },  // BNP Paribas
  "libelle":                      { canonical: "description", language: "fr", weight: 100 },
  "motif":                        { canonical: "description", language: "fr", weight: 85 },
  "communication":                { canonical: "description", language: "fr", weight: 80 },

  // ── COUNTERPARTY NAME ───────────────────────────────────────────────────────

  // Dutch
  "naam tegenpartij":             { canonical: "counterpartyName", language: "nl", weight: 100 },  // KBC BE
  "naam tegenp.":                 { canonical: "counterpartyName", language: "nl", weight: 100 },
  "begunstigde":                  { canonical: "counterpartyName", language: "nl", weight: 95 },
  "naam":                         { canonical: "counterpartyName", language: "nl", weight: 70 },

  // English
  "counterparty":                 { canonical: "counterpartyName", language: "en", weight: 100 },
  "counterparty name":            { canonical: "counterpartyName", language: "en", weight: 100 },
  "beneficiary":                  { canonical: "counterpartyName", language: "en", weight: 95 },
  "beneficiary name":             { canonical: "counterpartyName", language: "en", weight: 100 },
  "payee":                        { canonical: "counterpartyName", language: "en", weight: 90 },
  "payer":                        { canonical: "counterpartyName", language: "en", weight: 85 },
  "merchant":                     { canonical: "counterpartyName", language: "en", weight: 85 },
  "other party":                  { canonical: "counterpartyName", language: "en", weight: 85 },

  // German
  "beguenstigter/zahlungspflichtiger": { canonical: "counterpartyName", language: "de", weight: 100 },  // Sparkasse
  "auftraggeber/begünstigter":    { canonical: "counterpartyName", language: "de", weight: 100 },  // Deutsche Bank
  "empfänger":                    { canonical: "counterpartyName", language: "de", weight: 90 },
  "zahlungsempfänger":            { canonical: "counterpartyName", language: "de", weight: 90 },
  "zahlungspflichtiger":          { canonical: "counterpartyName", language: "de", weight: 85 },

  // French
  "tiers":                        { canonical: "counterpartyName", language: "fr", weight: 100 },  // BNP Paribas
  "bénéficiaire":                 { canonical: "counterpartyName", language: "fr", weight: 95 },
  "beneficiaire":                 { canonical: "counterpartyName", language: "fr", weight: 95 },
  "donneur d'ordre":              { canonical: "counterpartyName", language: "fr", weight: 85 },
  "contrepartie":                 { canonical: "counterpartyName", language: "fr", weight: 90 },

  // ── COUNTERPARTY IBAN ───────────────────────────────────────────────────────

  // Dutch
  "tegenrekening":                { canonical: "counterpartyIban", language: "nl", weight: 100 },  // ING NL
  "rekening tegenpartij":         { canonical: "counterpartyIban", language: "nl", weight: 100 },  // KBC BE
  "iban tegenpartij":             { canonical: "counterpartyIban", language: "nl", weight: 100 },  // Triodos
  "rekeningnummer tegenpartij":   { canonical: "counterpartyIban", language: "nl", weight: 95 },
  "kontonummer/iban":             { canonical: "counterpartyIban", language: "de", weight: 95 },

  // English
  "counterparty iban":            { canonical: "counterpartyIban", language: "en", weight: 100 },
  "counterparty account":         { canonical: "counterpartyIban", language: "en", weight: 95 },
  "account number":               { canonical: "counterpartyIban", language: "en", weight: 80 },
  "iban":                         { canonical: "counterpartyIban", language: "en", weight: 90 },
  "beneficiary iban":             { canonical: "counterpartyIban", language: "en", weight: 100 },
  "payment reference iban":       { canonical: "counterpartyIban", language: "en", weight: 90 },

  // German
  "empfänger iban":               { canonical: "counterpartyIban", language: "de", weight: 100 },
  "kontonummer":                  { canonical: "counterpartyIban", language: "de", weight: 75 },

  // French
  "iban du bénéficiaire":         { canonical: "counterpartyIban", language: "fr", weight: 100 },
  "rib":                          { canonical: "counterpartyIban", language: "fr", weight: 80 },

  // ── REFERENCE ───────────────────────────────────────────────────────────────

  // Dutch
  "kenmerk":                      { canonical: "reference", language: "nl", weight: 100 },  // ING NL
  "gestructureerde mededeling":   { canonical: "structuredReference", language: "nl", weight: 100 },  // KBC BE
  "vrije mededeling":             { canonical: "reference", language: "nl", weight: 95 },  // KBC BE
  "betalingskenmerk":             { canonical: "reference", language: "nl", weight: 90 },
  "referentie":                   { canonical: "reference", language: "nl", weight: 90 },

  // English
  "reference":                    { canonical: "reference", language: "en", weight: 100 },
  "payment reference":            { canonical: "reference", language: "en", weight: 100 },  // Bunq
  "transaction reference":        { canonical: "reference", language: "en", weight: 95 },
  "your reference":               { canonical: "reference", language: "en", weight: 90 },
  "end-to-end reference":         { canonical: "reference", language: "en", weight: 90 },
  "remittance info":              { canonical: "reference", language: "en", weight: 85 },
  "mandate reference":            { canonical: "reference", language: "en", weight: 85 },

  // German
  "kundenreferenz":               { canonical: "reference", language: "de", weight: 100 },  // Deutsche Bank
  "glaeubiger id":                { canonical: "reference", language: "de", weight: 90 },  // Sparkasse
  "gläubiger-id":                 { canonical: "reference", language: "de", weight: 90 },
  "mandatsreferenz":              { canonical: "reference", language: "de", weight: 90 },
  "referenz":                     { canonical: "reference", language: "de", weight: 85 },

  // French
  "référence":                    { canonical: "reference", language: "fr", weight: 100 },
  "numero de référence":          { canonical: "reference", language: "fr", weight: 95 },

  // ── ACCOUNT IBAN (own account) ───────────────────────────────────────────────

  // Dutch
  "rekening":                     { canonical: "accountIban", language: "nl", weight: 95 },  // ING NL
  "rekeningnummer":               { canonical: "accountIban", language: "nl", weight: 100 },  // KBC BE
  "eigen rekening":               { canonical: "accountIban", language: "nl", weight: 95 },

  // English
  "account":                      { canonical: "accountIban", language: "en", weight: 80 },
  "your account":                 { canonical: "accountIban", language: "en", weight: 90 },
  "my account":                   { canonical: "accountIban", language: "en", weight: 90 },

  // German
  "konto":                        { canonical: "accountIban", language: "de", weight: 75 },

  // French
  "numéro de compte":             { canonical: "accountIban", language: "fr", weight: 100 },
  "compte":                       { canonical: "accountIban", language: "fr", weight: 80 },

  // ── BIC / SWIFT ──────────────────────────────────────────────────────────────

  "bic code tegenpartij":         { canonical: "counterpartyBic", language: "nl", weight: 100 },  // KBC BE
  "bic":                          { canonical: "counterpartyBic", language: "en", weight: 100 },
  "swift":                        { canonical: "counterpartyBic", language: "en", weight: 100 },
  "bic code":                     { canonical: "counterpartyBic", language: "en", weight: 100 },
  "swift code":                   { canonical: "counterpartyBic", language: "en", weight: 100 },
  "bank code":                    { canonical: "counterpartyBic", language: "en", weight: 80 },

  // ── CURRENCY ────────────────────────────────────────────────────────────────
  "munt":                         { canonical: "currency", language: "nl", weight: 100 },  // KBC BE
  "currency":                     { canonical: "currency", language: "en", weight: 100 },
  "währung":                      { canonical: "currency", language: "de", weight: 100 },
  "devise":                       { canonical: "currency", language: "fr", weight: 100 },

  // ── STATEMENT NUMBER ────────────────────────────────────────────────────────
  "afschriftnummer":              { canonical: "statementNumber", language: "nl", weight: 100 },  // KBC BE
  "afschrift":                    { canonical: "statementNumber", language: "nl", weight: 90 },
  "statement number":             { canonical: "statementNumber", language: "en", weight: 100 },
  "kontoauszug":                  { canonical: "statementNumber", language: "de", weight: 100 },

};


// ─────────────────────────────────────────────────────────────────────────────
// LOOKUP FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalize a raw header string for alias lookup.
 * Lowercases, trims, collapses whitespace.
 */
export function normalizeHeader(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/['"]/g, "")   // strip quotes
    .replace(/\u00A0/g, " ");  // non-breaking space
}

/**
 * Resolve a raw header string to a canonical field.
 * Returns null if not recognized.
 *
 * Handles KBC BE column truncation:
 *   "Rekening tegenp" (truncated) → "counterpartyIban"
 */
export function resolveHeader(raw: string): HeaderAlias | null {
  const key = normalizeHeader(raw);
  if (HEADER_ALIASES[key]) return HEADER_ALIASES[key];

  // Partial match for truncated column names (e.g. KBC "Rekening tegenp")
  for (const [alias, info] of Object.entries(HEADER_ALIASES)) {
    if (alias.startsWith(key) || key.startsWith(alias)) {
      return { ...info, weight: Math.max(info.weight - 15, 50) };
    }
  }

  return null;
}

/**
 * Detect the most likely language of a header row.
 */
export function detectLanguage(headers: string[]): Language {
  const votes: Record<Language, number> = { nl: 0, en: 0, de: 0, fr: 0, unknown: 0 };

  for (const h of headers) {
    const resolved = resolveHeader(h);
    if (resolved) votes[resolved.language] += resolved.weight;
  }

  const sorted = (Object.entries(votes) as [Language, number][])
    .filter(([lang]) => lang !== "unknown")
    .sort(([, a], [, b]) => b - a);

  return sorted[0]?.[0] ?? "unknown";
}

/**
 * Map a full set of raw headers to canonical field names.
 * Returns a mapping of canonical field → raw column header.
 * Only includes fields with at least one match.
 */
export function mapHeaders(rawHeaders: string[]): Partial<Record<CanonicalField, string>> {
  const result: Partial<Record<CanonicalField, string>> = {};
  const bestWeight: Partial<Record<CanonicalField, number>> = {};

  for (const raw of rawHeaders) {
    if (!raw) continue;
    const resolved = resolveHeader(raw);
    if (!resolved) continue;

    const { canonical, weight } = resolved;
    if (!bestWeight[canonical] || weight > bestWeight[canonical]!) {
      bestWeight[canonical] = weight;
      result[canonical] = raw;
    }
  }

  return result;
}
