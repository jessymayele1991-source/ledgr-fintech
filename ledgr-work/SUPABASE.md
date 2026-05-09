# Supabase Setup for Ledgr v4

## Schema

Run `npm run db:push` to create all tables. Key tables:

### Transaction
The central table. Critical fields:
- `transactionHash` — SHA-256 dedup key (date + signedAmount + currency + counterpartyIban + reference + accountIban)
- `signedAmount` — negative = debit, positive = credit
- `amount` — always positive (absolute value)
- `type` — INCOME | EXPENSE | TRANSFER | REFUND

### Import
Tracks each file import job with status and error counts.

## Row Level Security (RLS)

Enable RLS on every table:

```sql
-- Run in Supabase SQL editor
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Transaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Client" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Import" ENABLE ROW LEVEL SECURITY;

-- Each user sees only their own data (enforced at API level via getCurrentUser())
```

## Connection String Notes

Supabase provides TWO connection strings:

1. **Transaction pooler** (port 6543) — use for `DATABASE_URL` in app
   - Supports connection pooling (important for serverless/Vercel)
   - Append `?pgbouncer=true`

2. **Direct connection** (port 5432) — use for `DIRECT_URL` (Prisma migrations)
   - Required for `prisma migrate dev` / `prisma db push`
   - Does NOT support pgBouncer

Both are required in `.env.local`.

## Seeding

```bash
npm run db:seed
```

Creates default categories for NL/BE freelancers:
- Groceries, Fuel, Telecom, Online Payments, Subscriptions
- Health Insurance, Taxes, Bank Fees, Travel, Shopping
- Salary, Child Benefit, Interest

## Auth

Ledgr uses Supabase Auth for user management.
The `User` table links to Supabase via `supabaseId` (UUID from auth.users).

User creation happens automatically on first login via the import API.
