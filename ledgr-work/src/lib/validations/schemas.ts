import { z } from "zod";

// ─────────────────────────────────────────────
// SHARED
// ─────────────────────────────────────────────

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});

export const dateRangeSchema = z.object({
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

// ─────────────────────────────────────────────
// ACCOUNT
// ─────────────────────────────────────────────

export const createAccountSchema = z.object({
  name: z.string().min(1).max(100),
  iban: z
    .string()
    .regex(/^[A-Z]{2}[0-9]{2}[A-Z0-9]{4,30}$/, "Invalid IBAN format")
    .optional()
    .or(z.literal("")),
  bic: z.string().max(11).optional().or(z.literal("")),
  currency: z.string().length(3).default("EUR"),
  type: z.enum(["CHECKING", "SAVINGS", "CREDIT", "INVESTMENT", "CASH"]).default("CHECKING"),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Must be a hex color")
    .optional()
    .or(z.literal("")),
});

export const updateAccountSchema = createAccountSchema.partial().extend({
  isActive: z.boolean().optional(),
});

// ─────────────────────────────────────────────
// CLIENT
// ─────────────────────────────────────────────

export const createClientSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
  vatNumber: z.string().max(30).optional().or(z.literal("")),
  iban: z
    .string()
    .regex(/^[A-Z]{2}[0-9]{2}[A-Z0-9]{4,30}$/, "Invalid IBAN format")
    .optional()
    .or(z.literal("")),
  address: z.string().max(500).optional().or(z.literal("")),
  city: z.string().max(100).optional().or(z.literal("")),
  country: z.string().max(100).optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
});

export const updateClientSchema = createClientSchema.partial().extend({
  isActive: z.boolean().optional(),
});

// ─────────────────────────────────────────────
// CATEGORY
// ─────────────────────────────────────────────

export const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional()
    .or(z.literal("")),
  icon: z.string().max(50).optional().or(z.literal("")),
  parentId: z.string().cuid().optional().nullable(),
});

export const updateCategorySchema = createCategorySchema.partial();

// ─────────────────────────────────────────────
// TRANSACTION
// ─────────────────────────────────────────────

export const createTransactionSchema = z.object({
  date: z.string().datetime(),
  amount: z.number().positive("Amount must be positive"),
  signedAmount: z.number(),
  currency: z.string().length(3).default("EUR"),
  type: z.enum(["INCOME", "EXPENSE", "TRANSFER", "REFUND"]),
  categoryId: z.string().cuid().optional().nullable(),
  clientId: z.string().cuid().optional().nullable(),
  accountId: z.string().cuid().optional().nullable(),
  counterpartyName: z.string().max(200).optional().nullable(),
  counterpartyIban: z.string().max(34).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  reference: z.string().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const updateTransactionSchema = createTransactionSchema.partial().extend({
  isReconciled: z.boolean().optional(),
});

// ─────────────────────────────────────────────
// TRANSACTION FILTERS
// ─────────────────────────────────────────────

export const transactionFiltersSchema = z.object({
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  amountMin: z.coerce.number().optional(),
  amountMax: z.coerce.number().optional(),
  type: z.enum(["INCOME", "EXPENSE", "TRANSFER", "REFUND", "ALL"]).optional(),
  categoryId: z.string().optional(),
  accountId: z.string().optional(),
  clientId: z.string().optional(),
  search: z.string().max(200).optional(),
  includeTransfers: z.coerce.boolean().optional().default(true),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
  sortBy: z.enum(["date", "amount", "description"]).optional().default("date"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
});

// ─────────────────────────────────────────────
// IMPORT
// ─────────────────────────────────────────────

export const columnMappingSchema = z.object({
  date: z.string().optional(),
  amount: z.string().optional(),
  description: z.string().optional(),
  counterpartyName: z.string().optional(),
  counterpartyIban: z.string().optional(),
  reference: z.string().optional(),
  creditDebit: z.string().optional(),
  debitAmount: z.string().optional(),
  creditAmount: z.string().optional(),
});

export const importSettingsSchema = z.object({
  accountId: z.string().cuid().optional(),
  mapping: columnMappingSchema.optional(),
  currency: z.string().length(3).default("EUR"),
});

// ─────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────

export const dashboardQuerySchema = z.object({
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  accountId: z.string().optional(),
});
