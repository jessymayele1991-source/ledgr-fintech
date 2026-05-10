import type { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser, apiError, apiSuccess } from "@/lib/utils/auth";
import { importSettingsSchema, columnMappingSchema } from "@/lib/validations/schemas";
import { processImportFile } from "@/lib/import/engine";
import { validateTransactionBatch, filterValidTransactions } from "@/lib/import/validator";
import { generateTransactionHash, determineTransactionType } from "@/lib/accounting/engine";
import { normalizeIban } from "@/lib/import/number-parser";
import type { NormalizedTransaction } from "@/types";

const ALLOWED_EXTENSIONS = ["csv", "xlsx", "xls", "mt940", "mt942", "mta", "sta", "xml", "txt", "pdf", "940"];
const BATCH_SIZE = 50; // DB writes per batch

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return apiError("Unauthorized", 401);

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const settingsRaw = formData.get("settings");
  const mappingRaw = formData.get("mapping");

  if (!file) return apiError("No file provided", 400);

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return apiError(
      `Unsupported file type ".${ext}". Allowed: CSV, XLSX, MT940, CAMT.053 XML.`,
      400
    );
  }

  // ── Parse settings ──────────────────────────────────────────────────
  let settings: { accountId?: string; currency?: string } = {};
  if (settingsRaw) {
    try {
      const parsed = importSettingsSchema.safeParse(JSON.parse(settingsRaw.toString()));
      if (parsed.success) settings = parsed.data;
    } catch { /* ignore */ }
  }

  let mappingOverride: Record<string, string> | undefined;
  if (mappingRaw) {
    try {
      const raw = JSON.parse(mappingRaw.toString());
      const parsed = columnMappingSchema.safeParse(raw);
      if (parsed.success) mappingOverride = parsed.data as Record<string, string>;
    } catch { /* ignore */ }
  }

  // ── Load user's own accounts for transfer detection ──────────────────
  const ownAccounts = await prisma.account.findMany({
    where: { userId: user.id, isActive: true },
    select: { id: true, iban: true },
  });

  const ownIbans = new Set<string>(
    ownAccounts.filter((a) => a.iban).map((a) => normalizeIban(a.iban!))
  );

  // Also add account IBAN from metadata if parser detected it
  let accountIban: string | null = null;
  if (settings.accountId) {
    const acct = ownAccounts.find((a) => a.id === settings.accountId);
    if (acct?.iban) {
      accountIban = normalizeIban(acct.iban);
      ownIbans.add(accountIban);
    }
  }

  // ── Parse file ───────────────────────────────────────────────────────
  const processed = await processImportFile(file, mappingOverride);

  // If MT940/CAMT detected an account IBAN, use it for transfer detection
  if (!accountIban && processed.metadata?.accountIban) {
    const detectedIban = normalizeIban(processed.metadata.accountIban);
    ownIbans.add(detectedIban);
    accountIban = detectedIban;
  }

  // ── Validate parsed transactions ─────────────────────────────────────
  const { results: validated } = validateTransactionBatch(processed.transactions);
  const safeTransactions = filterValidTransactions(validated);

  // ── Create import record ─────────────────────────────────────────────
  const importRecord = await prisma.import.create({
    data: {
      userId: user.id,
      fileName: file.name,
      fileType: processed.format,
      accountId: settings.accountId ?? null,
      status: "PROCESSING",
      totalRows: processed.totalRows,
    },
  });

  // ── Batch insert transactions ────────────────────────────────────────
  let importedRows = 0;
  let skippedRows = 0;
  const saveErrors: string[] = [];

  for (let i = 0; i < safeTransactions.length; i += BATCH_SIZE) {
    const batch = safeTransactions.slice(i, i + BATCH_SIZE);

    // Compute hashes for the whole batch first
    const hashed = batch.map((norm) => ({
      norm,
      hash: generateTransactionHash({
        date: norm.date,
        signedAmount: norm.signedAmount,
        currency: settings.currency ?? norm.currency,
        counterpartyIban: norm.counterpartyIban,
        reference: norm.reference,
        accountIban: accountIban ?? norm.accountIban,
      }),
    }));

    // Bulk-check for existing duplicates in one query
    const hashesToCheck = hashed.map((h) => h.hash);
    const existing = await prisma.transaction.findMany({
      where: {
        userId: user.id,
        transactionHash: { in: hashesToCheck },
      },
      select: { transactionHash: true },
    });
    const existingHashes = new Set(existing.map((e) => e.transactionHash));

    // Filter duplicates
    const toInsert = hashed.filter(({ hash }) => {
      if (existingHashes.has(hash)) {
        skippedRows++;
        return false;
      }
      return true;
    });

    if (toInsert.length === 0) continue;

    // Bulk createMany — much faster than N individual creates
    try {
      await prisma.transaction.createMany({
        data: toInsert.map(({ norm, hash }) => ({
          userId: user.id,
          date: norm.date,
          amount: norm.amount,
          signedAmount: norm.signedAmount,
          currency: settings.currency ?? norm.currency,
          type: determineTransactionType(norm.signedAmount, norm.counterpartyIban, ownIbans, norm.rawData as Record<string, unknown> | undefined),
          description: norm.description,
          reference: norm.reference,
          counterpartyName: norm.counterpartyName,
          counterpartyIban: norm.counterpartyIban,
          accountId: settings.accountId ?? null,
          importId: importRecord.id,
          transactionHash: hash,
          rawData: norm.rawData as Prisma.InputJsonValue,
        })),
        skipDuplicates: true, // extra safety: DB-level dedup
      });

      importedRows += toInsert.length;
    } catch (err) {
      saveErrors.push(
        `Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    }
  }

  // ── Finalize import record ───────────────────────────────────────────
  const allErrorMessages = [
    ...processed.errors.map((e) => `Row ${e.row} [${e.field}]: ${e.message}`),
    ...saveErrors,
  ];

  const finalStatus =
    importedRows === 0 && allErrorMessages.length > 0
      ? "FAILED"
      : allErrorMessages.length > 0 || skippedRows > 0
      ? "PARTIAL"
      : "COMPLETED";

  await prisma.import.update({
    where: { id: importRecord.id },
    data: {
      status: finalStatus,
      importedRows,
      skippedRows,
      errorRows: processed.errorRows,
      errors: allErrorMessages.slice(0, 100),
    },
  });

  return apiSuccess(
    {
      importId: importRecord.id,
      format: processed.format,
      status: finalStatus,
      totalRows: processed.totalRows,
      importedRows,
      skippedRows,
      errorRows: processed.errorRows,
      parseErrors: processed.errors.slice(0, 20),
      metadata: processed.metadata ?? null,
    },
    201
  );
}
