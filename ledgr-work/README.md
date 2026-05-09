# Ledgr v4 — European Fintech Bookkeeping SaaS

Production-ready accounting platform for European freelancers and SMEs.
Imports bank statements from 15+ European banks across 7 languages.

## Features

### Bank Format Support
| Format | Banks |
|--------|-------|
| MT940 / MT942 | ING NL, ABN AMRO, Rabobank, Deutsche Bank, Sparkasse, BNP Paribas |
| CAMT.053 / .052 / .054 | ING NL, ABN AMRO, Rabobank, Belfius, Deutsche Bank |
| pain.001 (SEPA credit transfer) | All SEPA banks |
| SEPA XML (pain.002/007/008) | All SEPA banks |
| CSV (auto-detected) | ING NL, KBC BE, Bunq, Rabobank, ABN AMRO, Revolut, Deutsche Bank, Sparkasse, BNP Paribas, Triodos, Belfius, Intesa Sanpaolo IT, BBVA ES, CGD PT |
| PDF OCR (architecture ready) | KBC BE, ING NL |

### Language Support
Dutch (NL/BE) · English · German · French · Italian · Spanish · Portuguese

### Accounting Engine
- Integer cent arithmetic (no float drift across 1000s of transactions)
- TRANSFER excluded from P&L
- REFUND reduces expenses (not revenue)
- SHA-256 dedup hash — cross-format duplicate detection
- MOD97 IBAN validation
- Reconciliation against CAMT/MT940 opening/closing balances

## Quick Start

```bash
npm install
cp .env.example .env.local
# Fill in DATABASE_URL, DIRECT_URL, SUPABASE_URL, SUPABASE_ANON_KEY
npm run db:generate
npm run db:push
npm run dev
```

## Tech Stack

Next.js 14 (App Router) · PostgreSQL/Prisma · Supabase Auth · Vercel · Tailwind CSS · TanStack Query v5

## Parser Test Results

Validated against 6 real banking files:
- `NL82INGB0004996760_*.xml` — ING NL CAMT.053, 308 entries, opening €0.28, closing €0.25
- `NL82INGB0004996760_*.940` — ING NL MT940, 308 transactions
- `NL82INGB0004996760_*.csv` — ING NL CSV, 308 rows
- `BE08736029512013_*-0.csv` — KBC BE CSV, 1730+ rows, 12 months
- `MT940E_NL_example_*.txt` — ING MT940 reference, trailing comma amounts
- `mt940-npp-sample-file.txt` — AU NPP MT940, AUD currency

**Test result: 142/142 assertions passed**

See `DEPLOYMENT.md` for Vercel + Supabase deployment.
