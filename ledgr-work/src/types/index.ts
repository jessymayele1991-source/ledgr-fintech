// ─────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────

export type TransactionType = "INCOME" | "EXPENSE" | "TRANSFER" | "REFUND";
export type CategoryType = "INCOME" | "EXPENSE" | "TRANSFER";
export type AccountType = "CHECKING" | "SAVINGS" | "CREDIT" | "INVESTMENT" | "CASH";
export type ImportStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "PARTIAL";

// ─────────────────────────────────────────────
// DOMAIN MODELS
// ─────────────────────────────────────────────

export interface User {
  id: string;
  supabaseId: string;
  email: string;
  name: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Account {
  id: string;
  userId: string;
  name: string;
  iban: string | null;
  bic: string | null;
  currency: string;
  type: AccountType;
  color: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Client {
  id: string;
  userId: string;
  name: string;
  email: string | null;
  phone: string | null;
  vatNumber: string | null;
  iban: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Category {
  id: string;
  userId: string;
  name: string;
  type: CategoryType;
  color: string | null;
  icon: string | null;
  parentId: string | null;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
  children?: Category[];
}

export interface Transaction {
  id: string;
  userId: string;
  date: Date;
  amount: number;          // Always positive
  signedAmount: number;    // Negative for debits, positive for credits
  currency: string;
  type: TransactionType;
  categoryId: string | null;
  clientId: string | null;
  accountId: string | null;
  counterpartyName: string | null;
  counterpartyIban: string | null;
  description: string | null;
  reference: string | null;
  transferPairId: string | null;
  importId: string | null;
  transactionHash: string;
  rawData: Record<string, unknown> | null;
  isManual: boolean;
  isReconciled: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  // Relations
  category?: Category | null;
  client?: Client | null;
  account?: Account | null;
}

export interface Import {
  id: string;
  userId: string;
  fileName: string;
  fileType: string;
  accountId: string | null;
  status: ImportStatus;
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  errorRows: number;
  errors: string[] | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─────────────────────────────────────────────
// NORMALIZED TRANSACTION (Import Layer)
// ─────────────────────────────────────────────

export interface NormalizedTransaction {
  date: Date;
  amount: number;           // Always positive
  signedAmount: number;     // Negative debit, positive credit
  currency: string;
  description: string | null;
  reference: string | null;
  counterpartyName: string | null;
  counterpartyIban: string | null;
  accountIban: string | null;
  rawData: Record<string, unknown>;
}

// ─────────────────────────────────────────────
// API RESPONSE TYPES
// ─────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  error: null;
}

export interface ApiError {
  data: null;
  error: {
    message: string;
    code?: string;
    details?: unknown;
  };
}

export type ApiResult<T> = ApiResponse<T> | ApiError;

// ─────────────────────────────────────────────
// DASHBOARD TYPES
// ─────────────────────────────────────────────

export interface DashboardSummary {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  cashflow: number;
  transactionCount: number;
  period: {
    from: Date;
    to: Date;
  };
}

export interface MonthlyData {
  month: string;      // "2024-01"
  revenue: number;
  expenses: number;
  profit: number;
}

export interface YearlyData {
  year: string;       // "2024"
  revenue: number;
  expenses: number;
  profit: number;
}

export interface CategoryBreakdown {
  categoryId: string;
  categoryName: string;
  color: string | null;
  total: number;
  count: number;
  percentage: number;
}

// ─────────────────────────────────────────────
// FILTER TYPES
// ─────────────────────────────────────────────

export interface TransactionFilters {
  dateFrom?: string;
  dateTo?: string;
  amountMin?: number;
  amountMax?: number;
  type?: TransactionType | "ALL";
  categoryId?: string;
  accountId?: string;
  clientId?: string;
  search?: string;
  includeTransfers?: boolean;
  page?: number;
  pageSize?: number;
  sortBy?: "date" | "amount" | "description";
  sortOrder?: "asc" | "desc";
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ─────────────────────────────────────────────
// IMPORT TYPES
// ─────────────────────────────────────────────

export interface ImportPreview {
  rows: NormalizedTransaction[];
  duplicates: number;
  errors: ImportRowError[];
  mapping: ColumnMapping;
}

export interface ColumnMapping {
  date: string;
  amount: string;
  description?: string;
  counterpartyName?: string;
  counterpartyIban?: string;
  reference?: string;
  creditDebit?: string;
  debitAmount?: string;
  creditAmount?: string;
}

export interface ImportRowError {
  row: number;
  field: string;
  message: string;
  rawValue: string;
}

export interface ImportResult {
  importId: string;
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  errorRows: number;
  errors: ImportRowError[];
}
