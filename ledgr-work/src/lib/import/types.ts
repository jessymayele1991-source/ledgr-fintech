/**
 * Shared types for the import engine.
 * Kept separate to avoid circular imports between parsers.
 */

export interface ImportRowError {
  row: number;
  field: string;
  message: string;
  rawValue: string;
}

export interface ColumnMapping {
  date: string;
  amount: string;
  description?: string;
  counterpartyName?: string;
  counterpartyIban?: string;
  reference?: string;
  creditDebit?: string;   // column with C/D indicator (separate from amount)
  debitAmount?: string;   // for split debit/credit columns
  creditAmount?: string;  // for split debit/credit columns
}

export type FileFormat =
  | "csv"
  | "xlsx"
  | "mt940"          // SWIFT MT940 end-of-day statement
  | "mt942"          // SWIFT MT942 intraday statement
  | "camt053"        // ISO 20022 end-of-day (BankToCustomerStatement)
  | "camt052"        // ISO 20022 intraday (BankToCustomerAccountReport)
  | "camt054"        // ISO 20022 debit/credit notification
  | "pain001"        // ISO 20022 credit transfer initiation
  | "sepa_xml"       // Generic SEPA XML (pain.002, pain.007, pain.008)
  | "pdf"            // PDF bank statement (OCR)
  | "txt"
  | "unknown";

export interface ProcessedImport {
  format: FileFormat;
  transactions: import("@/types").NormalizedTransaction[];
  errors: ImportRowError[];
  mapping: ColumnMapping | null;   // null for binary formats (MT940, CAMT)
  headers: string[];               // empty for binary formats
  totalRows: number;
  validRows: number;
  errorRows: number;
  metadata?: {
    accountIban?: string | null;
    currency?: string;
    openingBalance?: number | null;
    closingBalance?: number | null;
    statementId?: string | null;
    bankProfile?: string;
    periodStart?: string;
    periodEnd?: string;
    language?: string;
  };
}
