import { NextRequest } from "next/server";
import { getCurrentUser, apiError, apiSuccess } from "@/lib/utils/auth";
import { processImportFile } from "@/lib/import/engine";
import { validateTransactionBatch } from "@/lib/import/validator";
import { columnMappingSchema } from "@/lib/validations/schemas";

/**
 * POST /api/import/preview
 *
 * Accepts a file upload, parses it, runs validation, and returns
 * a structured preview without writing anything to the database.
 * The frontend uses this to show the mapping UI and row-level errors
 * before the user commits.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return apiError("Unauthorized", 401);

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const mappingRaw = formData.get("mapping");

  if (!file) return apiError("No file provided", 400);

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const ALLOWED = ["csv", "xlsx", "xls", "mt940", "mta", "sta", "xml", "txt"];
  if (!ALLOWED.includes(ext)) {
    return apiError(`Unsupported file type ".${ext}". Allowed: CSV, XLSX, MT940, CAMT.053 XML.`, 400);
  }

  // Parse optional column mapping override from frontend
  let mappingOverride: Record<string, string> | undefined;
  if (mappingRaw) {
    try {
      const raw = JSON.parse(mappingRaw.toString());
      const parsed = columnMappingSchema.safeParse(raw);
      if (parsed.success) mappingOverride = parsed.data as Record<string, string>;
    } catch { /* ignore bad JSON */ }
  }

  // Process the file (no DB writes)
  const processed = await processImportFile(file, mappingOverride);

  // Run validation on parsed transactions
  const { results: validated, totalErrors, totalWarnings } = validateTransactionBatch(
    processed.transactions
  );

  // Build preview rows (cap at 200 for the response)
  const PREVIEW_LIMIT = 200;
  const previewRows = validated.slice(0, PREVIEW_LIMIT).map(({ transaction: tx, issues }) => ({
    date: tx.date.toISOString().slice(0, 10),
    amount: tx.amount,
    signedAmount: tx.signedAmount,
    currency: tx.currency,
    description: tx.description,
    counterpartyName: tx.counterpartyName,
    counterpartyIban: tx.counterpartyIban,
    reference: tx.reference,
    issues: issues.map((i) => ({
      field: i.field,
      code: i.code,
      message: i.message,
      severity: i.severity,
    })),
    willImport: !issues.some((i) => i.severity === "error"),
  }));

  return apiSuccess({
    format: processed.format,
    headers: processed.headers,
    mapping: processed.mapping,
    metadata: processed.metadata ?? null,
    totalRows: processed.totalRows,
    validRows: processed.validRows,
    errorRows: processed.errorRows,
    parseErrors: processed.errors.slice(0, 50),
    validationErrors: totalErrors,
    validationWarnings: totalWarnings,
    preview: previewRows,
    previewCapped: processed.transactions.length > PREVIEW_LIMIT,
    // Summary of what will actually be imported
    willImportCount: validated.filter(({ issues }) =>
      !issues.some((i) => i.severity === "error")
    ).length,
  });
}
