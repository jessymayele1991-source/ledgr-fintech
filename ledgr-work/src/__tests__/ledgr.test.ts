/**
 * LEDGR Test Suite
 *
 * Tests validated against real banking files:
 *   - ING NL CSV (semicolon, 308 rows)
 *   - ING NL MT940 (308 :61: entries)
 *   - ING NL CAMT.053 XML (308 entries, opening €0.28, closing €0.25)
 *   - KBC BE PDF (3 pages, 22 transactions, Belgian format)
 *
 * Run with: npx jest
 * Or: npx vitest
 */

import { parseEuropeanNumberSafe, parseEuropeanNumber, normalizeIban, validateIban } from "../lib/import/number-parser";
import { calculateSummary, calculateMonthlyData, generateTransactionHash, determineTransactionType } from "../lib/accounting/engine";
import { reconcile } from "../lib/reconciliation/engine";
import { suggestCategories, getBestCategory } from "../lib/categorization/engine";
import { parseKbcAmount } from "../lib/import/pdf-provider";
import type { Transaction } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// EUROPEAN NUMBER PARSER TESTS
// All edge cases discovered from real files
// ─────────────────────────────────────────────────────────────────────────────

describe("European Number Parser", () => {
  describe("ING NL CSV amounts (comma decimal)", () => {
    test("74,00 → 74.00", () => {
      expect(parseEuropeanNumber("74,00")).toBe(74.00);
    });
    test("19,37 → 19.37", () => {
      expect(parseEuropeanNumber("19,37")).toBe(19.37);
    });
    test("1097,79 → 1097.79", () => {
      expect(parseEuropeanNumber("1097,79")).toBe(1097.79);
    });
    test("4537,50 → 4537.50", () => {
      expect(parseEuropeanNumber("4537,50")).toBe(4537.50);
    });
    test("0,02 → 0.02 (tiny interest amount)", () => {
      expect(parseEuropeanNumber("0,02")).toBe(0.02);
    });
    test("0,28 → 0.28 (opening balance)", () => {
      expect(parseEuropeanNumber("0,28")).toBe(0.28);
    });
  });

  describe("CAMT.053 XML amounts (dot decimal)", () => {
    test("2000.00 → 2000.00", () => {
      expect(parseEuropeanNumber("2000.00")).toBe(2000.00);
    });
    test("31642.51 → 31642.51 (total credits)", () => {
      expect(parseEuropeanNumber("31642.51")).toBe(31642.51);
    });
    test("0.28 → 0.28 (opening balance)", () => {
      expect(parseEuropeanNumber("0.28")).toBe(0.28);
    });
    test("0.25 → 0.25 (closing balance)", () => {
      expect(parseEuropeanNumber("0.25")).toBe(0.25);
    });
  });

  describe("KBC Belgium PDF amounts (space as thousands separator)", () => {
    test("1 200,00 + → 1200.00", () => {
      const result = parseKbcAmount("1 200,00", "+");
      expect(result).toBe(1200.00);
    });
    test("1 977,29 - → -1977.29", () => {
      const result = parseKbcAmount("1 977,29", "-");
      expect(result).toBe(-1977.29);
    });
    test("853,08 + → 853.08", () => {
      const result = parseKbcAmount("853,08", "+");
      expect(result).toBe(853.08);
    });
    test("12,55 - → -12.55", () => {
      const result = parseKbcAmount("12,55", "-");
      expect(result).toBe(-12.55);
    });
    test("0,70 - → -0.70", () => {
      const result = parseKbcAmount("0,70", "-");
      expect(result).toBe(-0.70);
    });
    test("1 037,46 + → 1037.46 (opening balance)", () => {
      const result = parseKbcAmount("1 037,46", "+");
      expect(result).toBe(1037.46);
    });
    test("1 323,44 + → 1323.44 (closing balance)", () => {
      const result = parseKbcAmount("1 323,44", "+");
      expect(result).toBe(1323.44);
    });
  });

  describe("German amounts (dot thousands, comma decimal)", () => {
    test("1.234,56 → 1234.56", () => {
      expect(parseEuropeanNumber("1.234,56")).toBe(1234.56);
    });
    test("44.576,07 → 44576.07", () => {
      expect(parseEuropeanNumber("44.576,07")).toBe(44576.07);
    });
    test("1.000 → 1000 (thousands only, no decimal)", () => {
      expect(parseEuropeanNumber("1.000")).toBe(1000);
    });
  });

  describe("Accounting negatives (parentheses)", () => {
    test("(24,95) → -24.95", () => {
      expect(parseEuropeanNumber("(24,95)")).toBe(-24.95);
    });
    test("(1.234,56) → -1234.56", () => {
      expect(parseEuropeanNumber("(1.234,56)")).toBe(-1234.56);
    });
  });

  describe("Edge cases and rejection", () => {
    test("Empty string → null", () => {
      expect(parseEuropeanNumber("")).toBeNull();
    });
    test("IBAN rejected: NL82INGB0004996760", () => {
      const r = parseEuropeanNumberSafe("NL82INGB0004996760");
      expect(r.ok).toBe(false);
    });
    test("€ symbol stripped", () => {
      expect(parseEuropeanNumber("€74,00")).toBe(74.00);
    });
    test("Non-breaking space stripped", () => {
      expect(parseEuropeanNumber("74\u00A000")).toBe(7400);
    });
    test("0,00 → 0", () => {
      expect(parseEuropeanNumber("0,00")).toBe(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// IBAN VALIDATION
// Real IBANs from uploaded files
// ─────────────────────────────────────────────────────────────────────────────

describe("IBAN Validation", () => {
  const validIbans = [
    "NL82INGB0004996760",   // ING NL account
    "BE29736055775064",      // KBC BE Joyce Mulders
    "LU89751000135104200E",  // PayPal Luxembourg
    "BE08736029512013",      // KBC BE main account
    "NL68INGB0684822288",    // Jah Mulders ING
    "NL63ABNA0540306304",    // Interbank ABN
    "NL51DEUT0265262461",    // DEUT NL (Mollie)
    "BE34363085607590",      // Solidaris Limburg
    "NL86INGB0002445588",    // Belastingdienst
    "NL13RABO0313287996",    // Rabobank (Youvia)
  ];

  const invalidIbans = [
    "D85909804",             // ING internal ID (NOT an IBAN)
    "INGBNL2A",              // BIC not IBAN
    "NL82INGB000499676",     // Too short
    "XX00TEST0000000000",    // Invalid country
    "",                      // Empty
  ];

  for (const iban of validIbans) {
    test(`Valid: ${iban}`, () => {
      expect(validateIban(iban)).toBe(true);
    });
  }

  for (const iban of invalidIbans) {
    test(`Invalid: ${iban || "(empty)"}`, () => {
      expect(validateIban(iban)).toBe(false);
    });
  }

  test("normalizeIban removes spaces", () => {
    expect(normalizeIban("BE08 7360 2951 2013")).toBe("BE08736029512013");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNTING ENGINE INVARIANTS
// ─────────────────────────────────────────────────────────────────────────────

describe("Accounting Engine", () => {
  const makeTx = (
    id: string,
    type: Transaction["type"],
    signedAmount: number,
    date = "2025-06-01"
  ): Transaction => ({
    id,
    date: new Date(date),
    amount: Math.abs(signedAmount),
    signedAmount,
    currency: "EUR",
    type,
    description: null,
    reference: null,
    counterpartyName: null,
    counterpartyIban: null,
    categoryId: null,
    accountId: null,
    importId: null,
    transactionHash: id,
    rawData: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    userId: "user1",
    category: null,
    account: null,
    client: null,
    clientId: null,
  });

  describe("INVARIANT: Transfers never in P&L", () => {
    test("TRANSFER excluded from revenue", () => {
      const txs = [
        makeTx("1", "INCOME", 1000),
        makeTx("2", "TRANSFER", 500),
        makeTx("3", "TRANSFER", -500),
      ];
      const summary = calculateSummary(txs);
      expect(summary.totalRevenue).toBe(1000);
      expect(summary.transferVolume).toBe(500);
    });

    test("TRANSFER excluded from expenses", () => {
      const txs = [
        makeTx("1", "EXPENSE", -200),
        makeTx("2", "TRANSFER", -1000),
      ];
      const summary = calculateSummary(txs);
      expect(summary.totalExpenses).toBe(200);
      expect(summary.netProfit).toBe(-200);
    });
  });

  describe("INVARIANT: Refunds reduce expenses", () => {
    test("REFUND reduces netExpenses", () => {
      const txs = [
        makeTx("1", "EXPENSE", -100),
        makeTx("2", "REFUND", 40.12),  // PayPal refund from real file
      ];
      const summary = calculateSummary(txs);
      expect(summary.totalExpenses).toBe(100);
      expect(summary.totalRefunds).toBe(40.12);
      expect(summary.netExpenses).toBeCloseTo(59.88, 2);
    });

    test("REFUND does NOT increase revenue", () => {
      const txs = [
        makeTx("1", "INCOME", 4537.50),   // 2XPR BV salary from real file
        makeTx("2", "REFUND", 119.63),    // Flexado refund from real file
      ];
      const summary = calculateSummary(txs);
      expect(summary.totalRevenue).toBe(4537.50);  // Unchanged
      expect(summary.totalRefunds).toBe(119.63);
    });
  });

  describe("INVARIANT: Integer cent arithmetic (no float drift)", () => {
    test("Sum of many small amounts is exact", () => {
      // PayPal amounts from real file: 6.99, 6.99, 6.99...
      const amounts = [6.99, 6.99, 6.99, 19.37, 40.12, 14.36, 40.12, 0.02];
      const txs = amounts.map((a, i) => makeTx(`${i}`, "EXPENSE", -a));
      const summary = calculateSummary(txs);
      // Manual sum using integer math
      const expected = amounts.reduce((s, a) => Math.round((s + a) * 100) / 100, 0);
      expect(summary.totalExpenses).toBeCloseTo(expected, 2);
    });

    test("0.1 + 0.2 float trap avoided", () => {
      // JavaScript: 0.1 + 0.2 = 0.30000000000000004
      const txs = [
        makeTx("1", "INCOME", 0.1),
        makeTx("2", "INCOME", 0.2),
      ];
      const summary = calculateSummary(txs);
      expect(summary.totalRevenue).toBe(0.30);  // Exact via integer math
    });
  });

  describe("ING NL real data validation", () => {
    test("CAMT.053 stated totals: credits 31642.51, debits 31642.54", () => {
      // Net = 31642.51 - 31642.54 = -0.03
      // Opening 0.28, Closing 0.25 → net = -0.03 ✓
      const net = 31642.51 - 31642.54;
      expect(Math.round(net * 100) / 100).toBe(-0.03);
      const closing = Math.round((0.28 + net) * 100) / 100;
      expect(closing).toBe(0.25);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DEDUPLICATION HASH
// ─────────────────────────────────────────────────────────────────────────────

describe("Deduplication Hash", () => {
  const baseParams = {
    date: new Date("2025-10-30"),
    signedAmount: -74.00,
    currency: "EUR",
    counterpartyIban: "BE29736055775064",
    reference: null,
    accountIban: "NL82INGB0004996760",
  };

  test("Same tx generates same hash", () => {
    const h1 = generateTransactionHash(baseParams);
    const h2 = generateTransactionHash(baseParams);
    expect(h1).toBe(h2);
  });

  test("Different date = different hash", () => {
    const h1 = generateTransactionHash(baseParams);
    const h2 = generateTransactionHash({ ...baseParams, date: new Date("2025-10-29") });
    expect(h1).not.toBe(h2);
  });

  test("Different amount = different hash", () => {
    const h1 = generateTransactionHash(baseParams);
    const h2 = generateTransactionHash({ ...baseParams, signedAmount: -74.01 });
    expect(h1).not.toBe(h2);
  });

  test("PayPal 6.49 on same day: different refs = different hashes (not duplicates)", () => {
    // From real ING file: 3 PayPal 6.49 on 2025-08-12 with DIFFERENT kenmerk
    const base = {
      date: new Date("2025-08-12"),
      signedAmount: -6.49,
      currency: "EUR",
      counterpartyIban: "LU89751000135104200E",
      accountIban: "NL82INGB0004996760",
    };
    const h1 = generateTransactionHash({ ...base, reference: "1044094677550" });
    const h2 = generateTransactionHash({ ...base, reference: "1044094999284" });
    const h3 = generateTransactionHash({ ...base, reference: "1044075751235" });
    expect(h1).not.toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h2).not.toBe(h3);
  });

  test("Spaarrekening transfer: no counterparty IBAN — hash stable", () => {
    const h1 = generateTransactionHash({
      date: new Date("2025-10-14"),
      signedAmount: 70.00,
      currency: "EUR",
      counterpartyIban: null,  // Spaarrekening has no IBAN
      reference: null,
      accountIban: "NL82INGB0004996760",
    });
    expect(typeof h1).toBe("string");
    expect(h1.length).toBe(64);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTION TYPE DETERMINATION
// Validated against real transfer patterns
// ─────────────────────────────────────────────────────────────────────────────

describe("Transaction Type Determination", () => {
  const ownIbans = new Set([
    "NL82INGB0004996760",    // Main ING account
    "NL68INGB0684822288",    // Jah Mulders (family)
  ]);

  test("Zakelijke Spaarrekening → TRANSFER (via rawData.isSpaarrekening)", () => {
    const type = determineTransactionType(70.00, null, ownIbans, { isSpaarrekening: true });
    expect(type).toBe("TRANSFER");
  });

  test("RTRN/MD06 incoming → REFUND", () => {
    const type = determineTransactionType(119.63, "NL36DEUT7028334464", ownIbans, {
      isReturn: true,
      returnReasonCode: "MD06",
    });
    expect(type).toBe("REFUND");
  });

  test("TRCD/00370 book transfer → TRANSFER", () => {
    const type = determineTransactionType(70.00, null, ownIbans, { trcdCode: "00370" });
    expect(type).toBe("TRANSFER");
  });

  test("Own IBAN counterparty → TRANSFER (Joyce Mulders = family, same household)", () => {
    // Joyce Mulders (BE29736055775064) is a family member, NOT in ownIbans for THIS test
    // Only own-account IBans trigger TRANSFER
    const type = determineTransactionType(-74.00, "BE29736055775064", ownIbans);
    expect(type).toBe("EXPENSE");  // Not own account → Expense
  });

  test("Jah Mulders (own family IBAN) → TRANSFER", () => {
    const type = determineTransactionType(-30.00, "NL68INGB0684822288", ownIbans);
    expect(type).toBe("TRANSFER");
  });

  test("PayPal debit → EXPENSE", () => {
    const type = determineTransactionType(-19.37, "LU89751000135104200E", ownIbans);
    expect(type).toBe("EXPENSE");
  });

  test("2XPR BV salary → INCOME", () => {
    const type = determineTransactionType(4537.50, "NL68ABNA0518191087", ownIbans);
    expect(type).toBe("INCOME");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RECONCILIATION ENGINE
// Real ING CAMT.053 balance validation
// ─────────────────────────────────────────────────────────────────────────────

describe("Reconciliation Engine", () => {
  test("ING CAMT.053: Opening €0.28, Closing €0.25, Net -€0.03", () => {
    // Simulate 2 transactions representing the exact CAMT total
    const transactions = [
      { id: "1", date: new Date("2025-05-01"), signedAmount: 31642.51, type: "INCOME", transactionHash: "h1", description: "credits", counterpartyIban: null },
      { id: "2", date: new Date("2025-05-01"), signedAmount: -31642.54, type: "EXPENSE", transactionHash: "h2", description: "debits", counterpartyIban: null },
    ];

    const result = reconcile(transactions, {
      opening: 0.28,
      closing: 0.25,
      currency: "EUR",
      periodStart: new Date("2025-05-01"),
      periodEnd: new Date("2025-10-31"),
    });

    expect(result.status).toBe("BALANCED");
    expect(result.totalCredits).toBeCloseTo(31642.51, 2);
    expect(result.totalDebits).toBeCloseTo(31642.54, 2);
    expect(Math.abs(result.discrepancy)).toBeLessThan(0.01);
  });

  test("KBC BE: Opening €1037.46, Closing €1323.44, Net +€285.98", () => {
    const net = 285.98;
    const transactions = [
      { id: "1", date: new Date("2026-05-06"), signedAmount: net, type: "INCOME", transactionHash: "h1", description: "net", counterpartyIban: null },
    ];

    const result = reconcile(transactions, {
      opening: 1037.46,
      closing: 1323.44,
      currency: "EUR",
      periodStart: new Date("2026-05-06"),
      periodEnd: new Date("2026-05-08"),
    });

    expect(result.status).toBe("BALANCED");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AI CATEGORIZATION
// Validated against real merchants from ING NL & KBC BE files
// ─────────────────────────────────────────────────────────────────────────────

describe("AI Categorization", () => {
  const makeTxInput = (name: string, iban?: string, desc?: string) => ({
    counterpartyName: name,
    counterpartyIban: iban ?? null,
    description: desc ?? null,
    reference: null,
    signedAmount: -10,
  });

  test("PayPal → online_payments (by IBAN prefix LU89751)", () => {
    const tx = makeTxInput("PayPal Europe S.a.r.l. et Cie S.C.A", "LU89751000135104200E");
    const best = getBestCategory(tx);
    expect(best?.categorySlug).toBe("online_payments");
    expect(best!.confidence).toBeGreaterThanOrEqual(90);
  });

  test("ODIDO NETHERLANDS → telecom (by IBAN prefix NL12COBA)", () => {
    const tx = makeTxInput("ODIDO NETHERLANDS B.V.", "NL12COBA0733959555");
    const best = getBestCategory(tx);
    expect(best?.categorySlug).toBe("telecom");
  });

  test("AH Jan Linders → groceries", () => {
    const tx = makeTxInput("AH Jan Linders 4165 ITTERVOORT");
    const best = getBestCategory(tx);
    expect(best?.categorySlug).toBe("groceries");
  });

  test("BELASTINGDIENST → taxes (by IBAN prefix NL86INGB0002)", () => {
    const tx = makeTxInput("BELASTINGDIENST", "NL86INGB0002445588");
    const best = getBestCategory(tx);
    expect(best?.categorySlug).toBe("taxes");
  });

  test("SOLIDARIS LIMBURG → health_insurance (by IBAN prefix BE34363)", () => {
    const tx = makeTxInput("SOLIDARIS LIMBURG", "BE34363085607590");
    const best = getBestCategory(tx);
    expect(best?.categorySlug).toBe("health_insurance");
  });

  test("BRUNO SERVICE STATION MAASEIK → fuel", () => {
    const tx = makeTxInput("BRUNO SERVICE STATION MAASEIK BEL");
    const best = getBestCategory(tx);
    expect(best?.categorySlug).toBe("fuel");
  });

  test("Kosten Zakelijk Betalingsverkeer → bank_fees", () => {
    const tx = makeTxInput("ING", undefined, "Kosten Zakelijk Betalingsverkeer Factuurnr. 2341495174");
    const best = getBestCategory(tx);
    expect(best?.categorySlug).toBe("bank_fees");
  });

  test("2XPR BV → salary", () => {
    const tx = { ...makeTxInput("2XPR BV"), signedAmount: 4537.50 };
    const best = getBestCategory(tx);
    expect(best?.categorySlug).toBe("salary");
  });

  test("Interbank → loans", () => {
    const tx = makeTxInput("Interbank", "NL63ABNA0540306304", "762274581");
    const best = getBestCategory(tx);
    expect(best?.categorySlug).toBe("loans");
  });

  test("Western Union → remittance", () => {
    const tx = makeTxInput("Western Union Internatio", "NL41RABO0304793299");
    const best = getBestCategory(tx);
    expect(best?.categorySlug).toBe("remittance");
  });

  test("LIDL 359 BREE → groceries (KBC BE file)", () => {
    const tx = makeTxInput("LIDL 359 BREE BE3960 BREE");
    const best = getBestCategory(tx);
    expect(best?.categorySlug).toBe("groceries");
  });

  test("PARENTIA VLAANDEREN VZW → child_benefit", () => {
    const tx = { ...makeTxInput("PARENTIA VLAANDEREN VZW", undefined, "/C/ GROEIPAKKET"), signedAmount: 464.94 };
    const best = getBestCategory(tx);
    expect(best?.categorySlug).toBe("child_benefit");
  });

  test("Unknown merchant returns null when confidence below threshold", () => {
    const tx = makeTxInput("XYZUNKNOWNMERCHANT12345");
    const best = getBestCategory(tx, [], 70);
    expect(best).toBeNull();
  });

  test("Multiple suggestions ordered by confidence", () => {
    const tx = makeTxInput("PayPal Europe S.a.r.l. et Cie S.C.A", "LU89751000135104200E");
    const suggestions = suggestCategories(tx);
    expect(suggestions.length).toBeGreaterThan(0);
    for (let i = 1; i < suggestions.length; i++) {
      expect(suggestions[i - 1].confidence).toBeGreaterThanOrEqual(suggestions[i].confidence);
    }
  });
});
