# Ledgr v4 — Deployment Guide

## 1. Supabase Setup

### 1.1 Create Project
1. Go to supabase.com → New Project
2. Note your Project URL and anon key (Settings → API)

### 1.2 Get Connection Strings (Settings → Database)

```
# Transaction pooler — port 6543 (use for DATABASE_URL)
DATABASE_URL=postgresql://postgres.PROJECTID:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres?pgbouncer=true

# Direct connection — port 5432 (use for DIRECT_URL / migrations)
DIRECT_URL=postgresql://postgres.PROJECTID:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres
```

### 1.3 Run Migrations
```bash
npm run db:generate    # generate Prisma client
npm run db:push        # push schema to Supabase
npm run db:seed        # optional: seed default categories
```

---

## 2. Environment Variables

Copy `.env.example` to `.env.local` and fill in all four variables.

| Variable | Source |
|----------|--------|
| `DATABASE_URL` | Supabase → Database → Transaction pooler (port 6543) |
| `DIRECT_URL` | Supabase → Database → Direct connection (port 5432) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → API → anon key |

---

## 3. Vercel Deployment

### 3.1 Add environment variables in Vercel Dashboard
Project → Settings → Environment Variables — add all four.

Or via CLI:
```bash
vercel env add DATABASE_URL
vercel env add DIRECT_URL
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
```

### 3.2 Deploy
```bash
vercel --prod
```

The build command (`prisma generate && next build`) is already in `vercel.json`.

---

## 4. Supabase Auth

Authentication → Providers → Email → Enable

URL Configuration:
```
Site URL: https://your-app.vercel.app
Redirect URLs:
  https://your-app.vercel.app/auth/callback
  http://localhost:3000/auth/callback
```

---

## 5. Local Development

```bash
npm install
npm run db:generate
npm run dev
# → http://localhost:3000
```

---

## 6. PDF OCR (Optional)

```bash
npm install pdf-parse
npm install --save-dev @types/pdf-parse
```

Architecture is ready in `src/lib/import/pdf-provider.ts`.

---

## 7. Production Checklist

- [ ] DATABASE_URL → Transaction Pooler port 6543
- [ ] DIRECT_URL → Direct connection port 5432
- [ ] `npm run db:migrate` run
- [ ] Vercel env vars set
- [ ] Supabase auth redirect URLs configured
- [ ] RLS enabled on all Supabase tables
