/**
 * LEDGR Audit Logging System
 *
 * Immutable audit trail for all data mutations:
 * - Transaction imports
 * - Manual edits (before/after)
 * - Deletions (with full snapshot)
 * - Categorization changes
 * - Balance recalculations
 *
 * Each log entry includes: user, timestamp, entity type, entity id,
 * action, before-state, after-state.
 *
 * Designed to be appended to a Prisma AuditLog model or written
 * as JSON lines to an audit file.
 */

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type AuditAction =
  | "TRANSACTION_IMPORTED"
  | "TRANSACTION_UPDATED"
  | "TRANSACTION_DELETED"
  | "TRANSACTION_CATEGORIZED"
  | "TRANSACTION_BULK_CATEGORIZED"
  | "TRANSACTION_BULK_DELETED"
  | "IMPORT_STARTED"
  | "IMPORT_COMPLETED"
  | "IMPORT_FAILED"
  | "ACCOUNT_CREATED"
  | "ACCOUNT_UPDATED"
  | "ACCOUNT_DELETED"
  | "CATEGORY_CREATED"
  | "CATEGORY_UPDATED"
  | "CATEGORY_DELETED"
  | "CLIENT_CREATED"
  | "CLIENT_UPDATED"
  | "CLIENT_DELETED"
  | "RECONCILIATION_RUN"
  | "USER_RULE_CREATED"
  | "USER_RULE_DELETED";

export type EntityType =
  | "Transaction"
  | "Import"
  | "Account"
  | "Category"
  | "Client"
  | "UserRule"
  | "Reconciliation";

export interface AuditLogEntry {
  id: string;
  userId: string;
  timestamp: Date;
  action: AuditAction;
  entityType: EntityType;
  entityId: string;
  /** Snapshot before change (null for creates) */
  before: Record<string, unknown> | null;
  /** Snapshot after change (null for deletes) */
  after: Record<string, unknown> | null;
  /** Human-readable summary */
  summary: string;
  /** Additional context (import file name, bulk count, etc.) */
  metadata: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILDERS
// ─────────────────────────────────────────────────────────────────────────────

function makeId(): string {
  return `aud_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function entry(
  userId: string,
  action: AuditAction,
  entityType: EntityType,
  entityId: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  summary: string,
  metadata: Record<string, unknown> = {}
): AuditLogEntry {
  return {
    id: makeId(),
    userId,
    timestamp: new Date(),
    action,
    entityType,
    entityId,
    before,
    after,
    summary,
    metadata,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTION EVENTS
// ─────────────────────────────────────────────────────────────────────────────

export function auditTransactionImported(
  userId: string,
  importId: string,
  transactionId: string,
  snapshot: Record<string, unknown>
): AuditLogEntry {
  return entry(
    userId,
    "TRANSACTION_IMPORTED",
    "Transaction",
    transactionId,
    null,
    snapshot,
    `Transaction imported from import ${importId}: ${snapshot.description ?? "(no description)"} €${snapshot.signedAmount}`,
    { importId }
  );
}

export function auditTransactionUpdated(
  userId: string,
  transactionId: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>
): AuditLogEntry {
  const changedFields = Object.keys(after).filter(
    (k) => JSON.stringify(before[k]) !== JSON.stringify(after[k])
  );
  return entry(
    userId,
    "TRANSACTION_UPDATED",
    "Transaction",
    transactionId,
    before,
    after,
    `Transaction ${transactionId} updated: ${changedFields.join(", ")}`,
    { changedFields }
  );
}

export function auditTransactionDeleted(
  userId: string,
  transactionId: string,
  snapshot: Record<string, unknown>
): AuditLogEntry {
  return entry(
    userId,
    "TRANSACTION_DELETED",
    "Transaction",
    transactionId,
    snapshot,
    null,
    `Transaction ${transactionId} deleted: ${snapshot.description ?? ""} €${snapshot.signedAmount}`,
    {}
  );
}

export function auditTransactionCategorized(
  userId: string,
  transactionId: string,
  prevCategoryId: string | null,
  prevCategoryName: string | null,
  newCategoryId: string | null,
  newCategoryName: string | null,
  source: "manual" | "ai" | "rule",
  confidence?: number
): AuditLogEntry {
  return entry(
    userId,
    "TRANSACTION_CATEGORIZED",
    "Transaction",
    transactionId,
    { categoryId: prevCategoryId, categoryName: prevCategoryName },
    { categoryId: newCategoryId, categoryName: newCategoryName },
    `Transaction categorized: "${prevCategoryName ?? "none"}" → "${newCategoryName ?? "none"}" (${source}${confidence != null ? `, ${confidence}% confidence` : ""})`,
    { source, confidence }
  );
}

export function auditBulkCategorized(
  userId: string,
  transactionIds: string[],
  newCategoryId: string | null,
  newCategoryName: string | null
): AuditLogEntry {
  return entry(
    userId,
    "TRANSACTION_BULK_CATEGORIZED",
    "Transaction",
    "bulk",
    null,
    { categoryId: newCategoryId, categoryName: newCategoryName },
    `${transactionIds.length} transactions bulk-categorized as "${newCategoryName ?? "none"}"`,
    { transactionIds, count: transactionIds.length }
  );
}

export function auditBulkDeleted(
  userId: string,
  transactionIds: string[]
): AuditLogEntry {
  return entry(
    userId,
    "TRANSACTION_BULK_DELETED",
    "Transaction",
    "bulk",
    { transactionIds },
    null,
    `${transactionIds.length} transactions bulk-deleted`,
    { transactionIds, count: transactionIds.length }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// IMPORT EVENTS
// ─────────────────────────────────────────────────────────────────────────────

export function auditImportStarted(
  userId: string,
  importId: string,
  fileName: string,
  fileType: string,
  totalRows: number
): AuditLogEntry {
  return entry(
    userId,
    "IMPORT_STARTED",
    "Import",
    importId,
    null,
    { fileName, fileType, totalRows, status: "PROCESSING" },
    `Import started: ${fileName} (${fileType}, ${totalRows} rows)`,
    { fileName, fileType, totalRows }
  );
}

export function auditImportCompleted(
  userId: string,
  importId: string,
  importedRows: number,
  skippedRows: number,
  errorRows: number
): AuditLogEntry {
  return entry(
    userId,
    "IMPORT_COMPLETED",
    "Import",
    importId,
    { status: "PROCESSING" },
    { status: "COMPLETED", importedRows, skippedRows, errorRows },
    `Import ${importId} completed: ${importedRows} imported, ${skippedRows} skipped, ${errorRows} errors`,
    { importedRows, skippedRows, errorRows }
  );
}

export function auditImportFailed(
  userId: string,
  importId: string,
  errors: string[]
): AuditLogEntry {
  return entry(
    userId,
    "IMPORT_FAILED",
    "Import",
    importId,
    { status: "PROCESSING" },
    { status: "FAILED", errors: errors.slice(0, 10) },
    `Import ${importId} failed with ${errors.length} errors`,
    { errorCount: errors.length, firstError: errors[0] }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY EVENTS
// ─────────────────────────────────────────────────────────────────────────────

export function auditCategoryCreated(
  userId: string,
  categoryId: string,
  snapshot: Record<string, unknown>
): AuditLogEntry {
  return entry(
    userId,
    "CATEGORY_CREATED",
    "Category",
    categoryId,
    null,
    snapshot,
    `Category created: "${snapshot.name}" (${snapshot.type})`,
    {}
  );
}

export function auditCategoryDeleted(
  userId: string,
  categoryId: string,
  snapshot: Record<string, unknown>,
  affectedTransactionCount: number
): AuditLogEntry {
  return entry(
    userId,
    "CATEGORY_DELETED",
    "Category",
    categoryId,
    snapshot,
    null,
    `Category "${snapshot.name}" deleted (${affectedTransactionCount} transactions detached)`,
    { affectedTransactionCount }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RECONCILIATION EVENTS
// ─────────────────────────────────────────────────────────────────────────────

export function auditReconciliationRun(
  userId: string,
  accountId: string,
  result: {
    status: string;
    discrepancy: number;
    transactionCount: number;
    issueCount: number;
  }
): AuditLogEntry {
  return entry(
    userId,
    "RECONCILIATION_RUN",
    "Reconciliation",
    accountId,
    null,
    result as Record<string, unknown>,
    `Reconciliation for account ${accountId}: ${result.status} (discrepancy: €${result.discrepancy.toFixed(2)}, ${result.issueCount} issues)`,
    {}
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PERSISTENCE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Write audit log entries to the database via Prisma.
 * Call this after any mutating operation.
 *
 * Usage:
 *   const log = auditTransactionUpdated(userId, tx.id, before, after);
 *   await persistAuditLog(prisma, [log]);
 */
export async function persistAuditLog(
  prisma: {
    auditLog: {
      createMany: (args: { data: AuditLogRecord[] }) => Promise<unknown>;
    };
  },
  entries: AuditLogEntry[]
): Promise<void> {
  if (entries.length === 0) return;
  const data: AuditLogRecord[] = entries.map((e) => ({
    id: e.id,
    userId: e.userId,
    timestamp: e.timestamp,
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId,
    before: e.before ?? undefined,
    after: e.after ?? undefined,
    summary: e.summary,
    metadata: e.metadata,
  }));
  await prisma.auditLog.createMany({ data });
}

interface AuditLogRecord {
  id: string;
  userId: string;
  timestamp: Date;
  action: string;
  entityType: string;
  entityId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  summary: string;
  metadata: Record<string, unknown>;
}
