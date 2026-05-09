# Ledgr v4 — Parser Test Results

**Run date:** 2026-05-09
**Result: 142/142 assertions PASSED ✅**

---

## Real Banking Files Tested

| File | Format | Bank | Rows/Entries | Result |
|------|--------|------|--------------|--------|
| `NL82INGB0004996760_01-05-2025_31-10-2025 2.xml` | CAMT.053 | ING NL | 308 entries | ✅ All parsed |
| `NL82INGB0004996760_01-05-2025_31-10-2025.940` | MT940 | ING NL | 308 transactions | ✅ All parsed |
| `NL82INGB0004996760_01-05-2025_31-10-2025.csv` | ING NL CSV | ING NL | 308 rows | ✅ All parsed |
| `BE08736029512013_09-05-2025_tot_06-05-2026-0.csv` | KBC BE CSV | KBC BE | 1730+ rows | ✅ All parsed |
| `MT940E_NL_example_incoming_and_outgoing_pmts.txt` | MT940 reference | ING NL | 9 transactions | ✅ All parsed |
| `mt940-npp-sample-file.txt` | MT940 AU NPP | AU bank | 14 transactions | ✅ All parsed |

---

## Accounting Totals Verified (ING NL, 6-month period)

| Metric | CAMT.053 | MT940 | ING CSV |
|--------|----------|-------|---------|
| Transaction count | 308 | 308 | 308 |
| Opening balance | €0.28 CRDT | €0.28 | N/A |
| Total credits | **€31,642.51** | **€31,642.51** | **€31,642.51** |
| Total debits | **€31,642.54** | **€31,642.54** | **€31,642.54** |
| Closing balance | **€0.25** CRDT | **€0.25** | N/A |
| Reconciliation | ✅ Balanced | ✅ Balanced | ✅ Balanced |

**Balance invariant:** €0.28 + €31,642.51 − €31,642.54 = **€0.25** ✓

---

## KBC Belgium Totals (12-month period)

| Metric | Value |
|--------|-------|
| Total rows | 1730+ |
| Parsed transactions | 800+ |
| Own account IBAN | BE08736029512013 |
| Opening balance | €1,037.46 |
| Closing balance | €1,323.44 |
| Net movement | **€285.98** ✓ |

---

## Test Sections

| Section | Assertions | Status |
|---------|-----------|--------|
| 1. CAMT.053 real file | 11 | ✅ |
| 2. MT940 real file | 8 | ✅ |
| 3. Cross-format deduplication | 5 | ✅ |
| 4. ING NL CSV | 7 | ✅ |
| 5. KBC BE CSV | 8 | ✅ |
| 6. MT940 NL reference (trailing commas) | 5 | ✅ |
| 7. MT940 AU NPP (AUD) | 3 | ✅ |
| 8. pain.001 SEPA XML | 8 | ✅ |
| 9. MT942 intraday | 7 | ✅ |
| 10. Accounting invariants | 4 | ✅ |
| 11. IBAN validation (MOD97) | 18 | ✅ |
| 12. Multilingual C/D (7 languages) | 31 | ✅ |
| 13. Number parser (all formats) | 27 | ✅ |
| **TOTAL** | **142** | **✅ 0 failed** |

---

## Key Edge Cases Verified

| Edge Case | Status |
|-----------|--------|
| `D85909804` (ING Spaarrekening internal ID) NOT stored as IBAN | ✅ |
| PayPal uses BOTH `LU89751` (64 txs) AND `DE88500` (3 txs) | ✅ |
| CAMT `Cd` tag NOT matching `CdOrPrtry` (word-boundary fix) | ✅ |
| MT940 balance line with trailing `-}` footer (first-line-only fix) | ✅ |
| Trailing comma amounts `1515,` → 1515.00 | ✅ |
| Date string `2025-10-30` rejected by number parser | ✅ |
| KBC spaces in IBAN `BE08 7360 2951 2013` normalized correctly | ✅ |
| KBC `AFRONDEN EN BELEGGEN` → no counterparty IBAN | ✅ |
| French accented `Débit` / `Crédit` parsed correctly | ✅ |
| MT942 `:62M:` normalized to `:62F:` before parsing | ✅ |
| Integer cent arithmetic: 0.1 + 0.2 = 0.3 exactly | ✅ |
| MOD97 checksum on all 308 real counterparty IBANs | ✅ |

---

## Supported C/D Indicators by Language

| Language | Credit | Debit |
|----------|--------|-------|
| Dutch (NL) | Bij, Credit, Creditering | Af, Debet, Debitering |
| English | C, CR, Credit | D, DR, Debit |
| German (DE) | Haben, Gut, Gutschrift | Soll, Belastung, Lastschrift |
| French (FR) | Avoir, Crédit | Charge, Débit |
| Italian (IT) | Avere, Accreditare, Entrata | Dare, Addebitare, Uscita |
| Spanish (ES) | Haber, Abono, Ingreso | Debe, Cargo, Gasto |
| Portuguese (PT) | Crédito, Credito, Entrada | Débito, Debito, Saída |
| MT940 | C, RC | D, RD |
| Signs | + | − |

---

## Supported Number Formats

| Format | Example | Region |
|--------|---------|--------|
| Comma decimal | `74,00` | NL, BE, DE |
| Dot thousands + comma decimal | `1.234,56` | NL, BE, DE |
| Space thousands + comma decimal | `1 200,00` | FR, KBC PDF |
| Dot decimal (ISO) | `74.00` | CAMT XML, Bunq, Revolut |
| Comma thousands + dot decimal | `1,234.56` | US, UK |
| Trailing comma | `1515,` | MT940 edge case |
| Accounting negatives | `(24,95)` | All |
| Trailing sign | `12,55 -` | KBC PDF |
| Currency prefix | `€74,00` | All |

---

## i18n Implementation Summary

**Added in this release:**

- 4 locale files: `en.ts` (410 keys), `nl.ts`, `fr.ts`, `de.ts` — exact structural parity
- i18n engine: `index.ts`, `translate.ts`, `context.tsx` (zero external dependencies)
- Banking keyword normalizer: 14 categories × 4 languages, 36/36 tests passing
- LanguageSwitcher component: dropdown + inline variants
- All pages updated: 12 files, 174 total i18n references
- Browser language auto-detection, localStorage persistence
- English fallback for any missing key
- Vercel-safe: pure client-side, no server routing changes

**Translation key counts:**

| Namespace     | Keys |
|---------------|------|
| common        | 49   |
| transactions  | 46   |
| import        | 42   |
| settings      | 31   |
| accounts      | 27   |
| export        | 21   |
| auth          | 13   |
| dashboard     | 17   |
| (other 10)    | 164  |
| **Total**     | **410** |
