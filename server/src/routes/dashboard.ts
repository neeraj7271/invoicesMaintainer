import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { prisma } from "../lib/prisma.js";
import {
  computeInvoiceStatus,
  decimalToNumber,
  outstandingAmount,
  serializeInvoice,
  startOfToday
} from "../lib/invoices.js";
import {
  ensureWorkspaceAccess,
  type AuthenticatedRequest
} from "../middleware/auth.js";

export const dashboardRouter = Router({ mergeParams: true });

function workspaceId(req: AuthenticatedRequest) {
  return req.params.workspaceId as string;
}

dashboardRouter.use(
  asyncHandler(async (req, _res, next) => {
    const request = req as AuthenticatedRequest;
    await ensureWorkspaceAccess(request.user.userId, workspaceId(request));
    next();
  })
);

dashboardRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const request = req as AuthenticatedRequest;
    const currentWorkspaceId = workspaceId(request);
    const today = startOfToday();
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const [workspace, clientsCount, invoices, activities] = await Promise.all([
      prisma.workspace.findUniqueOrThrow({ where: { id: currentWorkspaceId } }),
      prisma.client.count({ where: { workspaceId: currentWorkspaceId } }),
      prisma.invoice.findMany({
        where: { workspaceId: currentWorkspaceId },
        include: {
          client: true,
          payments: true,
          lineItems: true,
          attachments: true,
          reminderLogs: true
        },
        orderBy: { dueDate: "asc" }
      }),
      prisma.activity.findMany({
        where: { workspaceId: currentWorkspaceId },
        orderBy: { createdAt: "desc" },
        take: 12
      })
    ]);

    const openInvoices = invoices.filter((invoice) => invoice.status !== "PAID");
    const overdueInvoices = openInvoices.filter(
      (invoice) => computeInvoiceStatus(invoice) === "OVERDUE"
    );
    const upcomingInvoices = openInvoices.filter(
      (invoice) => invoice.dueDate >= today && invoice.dueDate <= weekEnd
    );

    const totalOutstanding = openInvoices.reduce(
      (sum, invoice) => sum + outstandingAmount(invoice),
      0
    );
    const overdueAmount = overdueInvoices.reduce(
      (sum, invoice) => sum + outstandingAmount(invoice),
      0
    );

    res.json({
      workspace: {
        id: workspace.id,
        name: workspace.name,
        currency: workspace.currency
      },
      metrics: {
        clientsCount,
        invoicesCount: invoices.length,
        outstandingCount: openInvoices.length,
        totalOutstanding,
        overdueCount: overdueInvoices.length,
        overdueAmount,
        upcomingCount: upcomingInvoices.length,
        upcomingAmount: upcomingInvoices.reduce(
          (sum, invoice) => sum + outstandingAmount(invoice),
          0
        ),
        paidAmount: invoices
          .filter((invoice) => invoice.status === "PAID")
          .reduce((sum, invoice) => sum + decimalToNumber(invoice.amount), 0)
      },
      upcomingInvoices: upcomingInvoices.slice(0, 8).map(serializeInvoice),
      overdueInvoices: overdueInvoices.slice(0, 8).map(serializeInvoice),
      recentActivity: activities.map((activity) => ({
        ...activity,
        createdAt: activity.createdAt.toISOString()
      }))
    });
  })
);
