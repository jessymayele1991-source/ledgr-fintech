import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser, apiError } from "@/lib/utils/auth";
import { exportTransactions } from "@/lib/export/engine";
import type { ExportOptions } from "@/lib/export/engine";
import type { Prisma } from "@prisma/client";
import type { Transaction } from "@/types";

/**
 * GET /api/export
 *
 * Query params:
 *  format       — csv | pdf | vat-summary | accountant
 *  dateFrom     — ISO date
 *  dateTo       — ISO date
 *  accountId    — filter by account
 *  categoryId   — filter by category
 *  includeTransfers — boolean
 *  vatRate      — e.g. 0.21
 *  orgName      — organization name for report header
 *  locale       — e.g. nl-NL, de-DE, fr-FR
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return apiError("Unauthorized", 401);

    const { searchParams } = request.nextUrl;
    const format = (searchParams.get("format") ?? "csv") as ExportOptions["format"];
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const accountId = searchParams.get("accountId");
    const categoryId = searchParams.get("categoryId");
    const includeTransfers = searchParams.get("includeTransfers") !== "false";
    const vatRate = parseFloat(searchParams.get("vatRate") ?? "0.21");
    const orgName = searchParams.get("orgName") ?? undefined;
    const locale = searchParams.get("locale") ?? "nl-NL";

    const ALLOWED_FORMATS = ["csv", "pdf", "vat-summary", "accountant", "xlsx"] as const;
    if (!ALLOWED_FORMATS.includes(format as typeof ALLOWED_FORMATS[number])) {
      return apiError(`Invalid format. Allowed: ${ALLOWED_FORMATS.join(", ")}`, 400);
    }

    // ── Build DB query ─────────────────────────────────────────────────────────
    const where: Prisma.TransactionWhereInput = {
      userId: user.id,
    };

    if (dateFrom) where.date = { ...((where.date as object) || {}), gte: new Date(dateFrom) };
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      where.date = { ...((where.date as object) || {}), lte: to };
    }
    if (accountId) where.accountId = accountId;
    if (categoryId) where.categoryId = categoryId;
    if (!includeTransfers) where.NOT = { type: "TRANSFER" };

    const rawTxs = await prisma.transaction.findMany({
      where,
      include: {
        category: { select: { id: true, name: true, color: true } },
        account: { select: { id: true, name: true, iban: true } },
      },
      orderBy: { date: "desc" },
      take: 50000, // Safety cap for exports
    });

    // Cast to our Transaction type
    const transactions = rawTxs as unknown as Transaction[];

    // ── Export ─────────────────────────────────────────────────────────────────
    const opts: ExportOptions = {
      format,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      includeTransfers,
      vatRate,
      organizationName: orgName,
      locale,
      decimalSeparator: locale.startsWith("nl") || locale.startsWith("de") || locale.startsWith("fr") ? "," : ".",
      thousandsSeparator: locale.startsWith("nl") || locale.startsWith("de") ? "." : locale.startsWith("fr") ? " " : "",
      currency: "EUR",
    };

    const result = exportTransactions(transactions, opts);

    // ── Log to audit ───────────────────────────────────────────────────────────
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "export.generated",
        entityType: "export",
        metadata: {
          format,
          rowCount: transactions.length,
          dateFrom,
          dateTo,
          includeTransfers,
        },
      },
    }).catch(() => {}); // Non-fatal

    // ── Return file ────────────────────────────────────────────────────────────
    const body = result.encoding === "base64"
      ? new Uint8Array(Buffer.from(result.content, "base64"))
      : result.content;

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": result.mimeType,
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[export] GET error:", err);
    return apiError("Internal server error", 500);
  }
}
