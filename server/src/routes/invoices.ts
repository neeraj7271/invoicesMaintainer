import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "express";
import multer from "multer";
import { Prisma, type InvoiceStatus } from "@prisma/client";
import { z } from "zod";
import { config } from "../config.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { badRequest, notFound } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { recordActivity } from "../lib/activity.js";
import {
  calculateLineItemAmount,
  computeInvoiceStatus,
  normalizeSchedule,
  serializeInvoice,
  startOfToday
} from "../lib/invoices.js";
import { sendInvoiceReminder } from "../lib/reminders.js";
import {
  ensureWorkspaceAccess,
  type AuthenticatedRequest
} from "../middleware/auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../../..");
const uploadDir = path.resolve(projectRoot, config.uploadDir);
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "-");
    cb(null, `${Date.now()}-${Math.random().toString(16).slice(2)}-${safeName}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

export const invoicesRouter = Router({ mergeParams: true });

function workspaceId(req: AuthenticatedRequest) {
  return req.params.workspaceId as string;
}

function invoiceId(req: AuthenticatedRequest) {
  return req.params.invoiceId as string;
}

const lineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().nonnegative()
});

const invoiceSchema = z.object({
  clientId: z.string().min(1),
  amount: z.coerce.number().positive().optional(),
  currency: z.string().min(3).max(3).optional(),
  issueDate: z.coerce.date(),
  dueDate: z.coerce.date(),
  description: z.string().optional().nullable(),
  status: z
    .enum(["UNPAID", "PARTIALLY_PAID", "PAID", "OVERDUE"])
    .optional()
    .default("UNPAID"),
  lineItems: z.array(lineItemSchema).default([]),
  reminderSchedule: z.array(z.coerce.number().int()).optional()
});

const paymentSchema = z.object({
  amount: z.coerce.number().positive(),
  paidAt: z.coerce.date(),
  note: z.string().optional().nullable()
});

const manualReminderSchema = z.object({
  offsetDays: z.coerce.number().int().optional()
});

invoicesRouter.use(
  asyncHandler(async (req, _res, next) => {
    const request = req as AuthenticatedRequest;
    await ensureWorkspaceAccess(request.user.userId, workspaceId(request));
    next();
  })
);

async function nextInvoiceNumber(workspaceId: string) {
  const year = new Date().getFullYear();
  const count = await prisma.invoice.count({
    where: {
      workspaceId,
      invoiceNumber: { startsWith: `INV-${year}-` }
    }
  });
  return `INV-${year}-${String(count + 1).padStart(4, "0")}`;
}

async function getWorkspaceCurrency(workspaceId: string) {
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: { currency: true, defaultReminderSchedule: true }
  });
  return workspace;
}

function totalFromLineItems(items: z.infer<typeof lineItemSchema>[]) {
  return items.reduce(
    (sum, item) =>
      sum +
      calculateLineItemAmount({
        quantity: item.quantity,
        unitPrice: item.unitPrice
      }),
    0
  );
}

function lineItemWrites(items: z.infer<typeof lineItemSchema>[]) {
  return items.map((item) => {
    const amount = calculateLineItemAmount({
      quantity: item.quantity,
      unitPrice: item.unitPrice
    });
    return {
      description: item.description,
      quantity: new Prisma.Decimal(item.quantity),
      unitPrice: new Prisma.Decimal(item.unitPrice),
      amount: new Prisma.Decimal(amount)
    };
  });
}

function normalizeStoredStatus(status: InvoiceStatus, dueDate: Date) {
  if (status === "PAID") {
    return "PAID";
  }
  return computeInvoiceStatus({ status, dueDate }) === "OVERDUE"
    ? "OVERDUE"
    : status === "OVERDUE"
      ? "UNPAID"
      : status;
}

async function findInvoice(workspaceId: string, invoiceId: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, workspaceId },
    include: {
      client: true,
      lineItems: true,
      payments: { orderBy: { paidAt: "desc" } },
      attachments: { orderBy: { createdAt: "desc" } },
      reminderLogs: { orderBy: { sentAt: "desc" } }
    }
  });
  if (!invoice) {
    throw notFound("Invoice not found");
  }
  return invoice;
}

invoicesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const request = req as AuthenticatedRequest;
    const currentWorkspaceId = workspaceId(request);
    const clientId = String(req.query.clientId ?? "");
    const status = String(req.query.status ?? "");
    const q = String(req.query.q ?? "").trim();
    const startDate = req.query.startDate
      ? new Date(String(req.query.startDate))
      : undefined;
    const endDate = req.query.endDate
      ? new Date(String(req.query.endDate))
      : undefined;
    const today = startOfToday();

    const where: Prisma.InvoiceWhereInput = {
      workspaceId: currentWorkspaceId,
      ...(clientId ? { clientId } : {}),
      ...(startDate || endDate
        ? {
            dueDate: {
              ...(startDate ? { gte: startDate } : {}),
              ...(endDate ? { lte: endDate } : {})
            }
          }
        : {}),
      ...(q
        ? {
            OR: [
              { invoiceNumber: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
              { client: { name: { contains: q, mode: "insensitive" } } },
              { client: { company: { contains: q, mode: "insensitive" } } }
            ]
          }
        : {})
    };

    if (status === "OVERDUE") {
      where.status = { not: "PAID" };
      where.dueDate = { ...(where.dueDate as object), lt: today };
    } else if (["UNPAID", "PARTIALLY_PAID", "PAID"].includes(status)) {
      where.status = status as InvoiceStatus;
      if (status !== "PAID") {
        where.dueDate = { ...(where.dueDate as object), gte: today };
      }
    }

    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        client: true,
        lineItems: true,
        payments: true,
        attachments: true,
        reminderLogs: { orderBy: { sentAt: "desc" } }
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }]
    });

    res.json(invoices.map(serializeInvoice));
  })
);

invoicesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const request = req as AuthenticatedRequest;
    const user = request.user;
    const currentWorkspaceId = workspaceId(request);
    const input = invoiceSchema.parse(req.body);
    const client = await prisma.client.findFirst({
      where: { id: input.clientId, workspaceId: currentWorkspaceId }
    });
    if (!client) {
      throw badRequest("Client does not belong to this workspace");
    }

    const workspace = await getWorkspaceCurrency(currentWorkspaceId);
    const lineTotal = totalFromLineItems(input.lineItems);
    const amount = input.amount ?? lineTotal;
    if (!amount || amount <= 0) {
      throw badRequest("Invoice amount or line items are required");
    }

    const invoice = await prisma.invoice.create({
      data: {
        workspaceId: currentWorkspaceId,
        clientId: input.clientId,
        invoiceNumber: await nextInvoiceNumber(currentWorkspaceId),
        amount: new Prisma.Decimal(amount),
        currency: (input.currency ?? workspace.currency).toUpperCase(),
        issueDate: input.issueDate,
        dueDate: input.dueDate,
        description: input.description,
        status: normalizeStoredStatus(input.status, input.dueDate),
        reminderSchedule: normalizeSchedule(
          input.reminderSchedule,
          workspace.defaultReminderSchedule
        ),
        lineItems:
          input.lineItems.length > 0
            ? { create: lineItemWrites(input.lineItems) }
            : undefined
      },
      include: {
        client: true,
        lineItems: true,
        payments: true,
        attachments: true,
        reminderLogs: true
      }
    });

    await recordActivity({
      workspaceId: currentWorkspaceId,
      userId: user.userId,
      type: "INVOICE_CREATED",
      title: `${invoice.invoiceNumber} created`,
      body: `${client.name} owes ${invoice.currency} ${invoice.amount}`,
      entityType: "invoice",
      entityId: invoice.id
    });

    res.status(201).json(serializeInvoice(invoice));
  })
);

invoicesRouter.get(
  "/:invoiceId",
  asyncHandler(async (req, res) => {
    const request = req as AuthenticatedRequest;
    const invoice = await findInvoice(workspaceId(request), invoiceId(request));
    res.json(serializeInvoice(invoice));
  })
);

invoicesRouter.put(
  "/:invoiceId",
  asyncHandler(async (req, res) => {
    const request = req as AuthenticatedRequest;
    const user = request.user;
    const currentWorkspaceId = workspaceId(request);
    const input = invoiceSchema.parse(req.body);
    const existing = await findInvoice(currentWorkspaceId, invoiceId(request));
    const client = await prisma.client.findFirst({
      where: { id: input.clientId, workspaceId: currentWorkspaceId }
    });
    if (!client) {
      throw badRequest("Client does not belong to this workspace");
    }

    const workspace = await getWorkspaceCurrency(currentWorkspaceId);
    const lineTotal = totalFromLineItems(input.lineItems);
    const amount = input.amount ?? lineTotal;
    if (!amount || amount <= 0) {
      throw badRequest("Invoice amount or line items are required");
    }

    const invoice = await prisma.$transaction(async (tx) => {
      await tx.lineItem.deleteMany({ where: { invoiceId: existing.id } });
      return tx.invoice.update({
        where: { id: existing.id },
        data: {
          clientId: input.clientId,
          amount: new Prisma.Decimal(amount),
          currency: (input.currency ?? workspace.currency).toUpperCase(),
          issueDate: input.issueDate,
          dueDate: input.dueDate,
          description: input.description,
          status: normalizeStoredStatus(input.status, input.dueDate),
          reminderSchedule: normalizeSchedule(
            input.reminderSchedule,
            workspace.defaultReminderSchedule
          ),
          lineItems:
            input.lineItems.length > 0
              ? { create: lineItemWrites(input.lineItems) }
              : undefined
        },
        include: {
          client: true,
          lineItems: true,
          payments: true,
          attachments: true,
          reminderLogs: { orderBy: { sentAt: "desc" } }
        }
      });
    });

    await recordActivity({
      workspaceId: currentWorkspaceId,
      userId: user.userId,
      type: "INVOICE_UPDATED",
      title: `${invoice.invoiceNumber} updated`,
      entityType: "invoice",
      entityId: invoice.id
    });

    res.json(serializeInvoice(invoice));
  })
);

invoicesRouter.delete(
  "/:invoiceId",
  asyncHandler(async (req, res) => {
    const request = req as AuthenticatedRequest;
    const invoice = await findInvoice(workspaceId(request), invoiceId(request));
    await prisma.invoice.delete({ where: { id: invoice.id } });
    res.status(204).send();
  })
);

invoicesRouter.post(
  "/:invoiceId/payments",
  asyncHandler(async (req, res) => {
    const request = req as AuthenticatedRequest;
    const user = request.user;
    const invoice = await findInvoice(workspaceId(request), invoiceId(request));
    const input = paymentSchema.parse(req.body);
    const payment = await prisma.payment.create({
      data: {
        invoiceId: invoice.id,
        amount: new Prisma.Decimal(input.amount),
        paidAt: input.paidAt,
        note: input.note
      }
    });

    const payments = await prisma.payment.findMany({
      where: { invoiceId: invoice.id }
    });
    const paid = payments.reduce(
      (sum, item) => sum + Number(item.amount.toString()),
      0
    );
    const total = Number(invoice.amount.toString());
    const status: InvoiceStatus = paid >= total ? "PAID" : "PARTIALLY_PAID";
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status }
    });

    await recordActivity({
      workspaceId: workspaceId(request),
      userId: user.userId,
      type: "PAYMENT_RECORDED",
      title: `Payment recorded for ${invoice.invoiceNumber}`,
      body: `${invoice.currency} ${input.amount.toFixed(2)}`,
      entityType: "invoice",
      entityId: invoice.id
    });

    res.status(201).json({
      ...payment,
      amount: Number(payment.amount.toString()),
      paidAt: payment.paidAt.toISOString(),
      createdAt: payment.createdAt.toISOString()
    });
  })
);

invoicesRouter.post(
  "/:invoiceId/attachment",
  upload.single("attachment"),
  asyncHandler(async (req, res) => {
    const request = req as AuthenticatedRequest;
    const invoice = await findInvoice(workspaceId(request), invoiceId(request));
    if (!req.file) {
      throw badRequest("Attachment file is required");
    }
    const relativePath = path
      .relative(projectRoot, req.file.path)
      .replace(/\\/g, "/");
    const attachment = await prisma.attachment.create({
      data: {
        invoiceId: invoice.id,
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        path: relativePath
      }
    });
    res.status(201).json({
      ...attachment,
      url: `/${relativePath}`,
      createdAt: attachment.createdAt.toISOString()
    });
  })
);

invoicesRouter.post(
  "/:invoiceId/reminders/send",
  asyncHandler(async (req, res) => {
    const request = req as AuthenticatedRequest;
    const user = request.user;
    const invoice = await findInvoice(workspaceId(request), invoiceId(request));
    const input = manualReminderSchema.parse(req.body);
    const offsetDays =
      input.offsetDays ??
      Math.round(
        (startOfToday().getTime() - startOfToday(invoice.dueDate).getTime()) /
          (1000 * 60 * 60 * 24)
      );
    const log = await sendInvoiceReminder({
      invoiceId: invoice.id,
      offsetDays,
      userId: user.userId
    });
    res.status(201).json({
      ...log,
      sentAt: log.sentAt.toISOString()
    });
  })
);
