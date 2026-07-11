import { describe, expect, it } from "vitest";
import {
  agingBucketForDays,
  computeInvoiceStatus,
  normalizeSchedule
} from "../server/src/lib/invoices.js";

describe("invoice helpers", () => {
  it("computes overdue from due date when the invoice is not paid", () => {
    const referenceDate = new Date("2026-07-10T12:00:00.000Z");
    const status = computeInvoiceStatus(
      {
        status: "UNPAID",
        dueDate: new Date("2026-07-01T12:00:00.000Z")
      },
      referenceDate
    );

    expect(status).toBe("OVERDUE");
  });

  it("keeps paid invoices paid even when due date has passed", () => {
    const referenceDate = new Date("2026-07-10T12:00:00.000Z");
    const status = computeInvoiceStatus(
      {
        status: "PAID",
        dueDate: new Date("2026-07-01T12:00:00.000Z")
      },
      referenceDate
    );

    expect(status).toBe("PAID");
  });

  it("normalizes reminder schedules by removing invalid values and duplicates", () => {
    expect(normalizeSchedule([-3, 0, 3, 3, 500, 7.5, "14"], [-3, 0])).toEqual([
      -3,
      0,
      3,
      14
    ]);
  });

  it("assigns aging buckets", () => {
    expect(agingBucketForDays(12)).toBe("0-30");
    expect(agingBucketForDays(44)).toBe("31-60");
    expect(agingBucketForDays(77)).toBe("61-90");
    expect(agingBucketForDays(120)).toBe("90+");
  });
});
