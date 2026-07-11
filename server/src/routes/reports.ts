import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { prisma } from "../lib/prisma.js";
import {
  agingBucketForDays,
  outstandingAmount,
  serializeInvoice,
  startOfToday
} from "../lib/invoices.js";
import {
  ensureWorkspaceAccess,
  type AuthenticatedRequest
} from "../middleware/auth.js";

export const reportsRouter = Router({ mergeParams: true });

function workspaceId(req: AuthenticatedRequest) {
  return req.params.workspaceId as string;
}

reportsRouter.use(
  asyncHandler(async (req, _res, next) => {
    const request = req as AuthenticatedRequest;
    await ensureWorkspaceAccess(request.user.userId, workspaceId(request));
    next();
  })
);

reportsRouter.get(
  "/aging",
  asyncHandler(async (req, res) => {
    const request = req as AuthenticatedRequest;
    const currentWorkspaceId = workspaceId(request);
    const today = startOfToday();
    const invoices = await prisma.invoice.findMany({
      where: {
        workspaceId: currentWorkspaceId,
        status: { not: "PAID" },
        dueDate: { lt: today }
      },
      include: {
        client: true,
        payments: true,
        lineItems: true,
        attachments: true,
        reminderLogs: true
      },
      orderBy: { dueDate: "asc" }
    });

    const buckets: Record<
      string,
      { label: string; total: number; count: number; invoices: unknown[] }
    > = {
      "0-30": { label: "0-30", total: 0, count: 0, invoices: [] },
      "31-60": { label: "31-60", total: 0, count: 0, invoices: [] },
      "61-90": { label: "61-90", total: 0, count: 0, invoices: [] },
      "90+": { label: "90+", total: 0, count: 0, invoices: [] }
    };

    for (const invoice of invoices) {
      const daysOverdue = Math.max(
        0,
        Math.floor(
          (today.getTime() - invoice.dueDate.getTime()) / (1000 * 60 * 60 * 24)
        )
      );
      const key = agingBucketForDays(daysOverdue);
      const serialized = {
        ...serializeInvoice(invoice),
        daysOverdue
      };
      buckets[key].total += outstandingAmount(invoice);
      buckets[key].count += 1;
      buckets[key].invoices.push(serialized);
    }

    res.json({
      buckets: Object.values(buckets),
      total: Object.values(buckets).reduce((sum, bucket) => sum + bucket.total, 0),
      count: invoices.length
    });
  })
);
