import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { badRequest, notFound } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { recordActivity } from "../lib/activity.js";
import { serializeInvoice } from "../lib/invoices.js";
import {
  ensureWorkspaceAccess,
  type AuthenticatedRequest
} from "../middleware/auth.js";

export const clientsRouter = Router({ mergeParams: true });

const clientSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
  notes: z.string().optional().nullable()
});

function workspaceId(req: AuthenticatedRequest) {
  return req.params.workspaceId as string;
}

function clientId(req: AuthenticatedRequest) {
  return req.params.clientId as string;
}

clientsRouter.use(
  asyncHandler(async (req, _res, next) => {
    const request = req as AuthenticatedRequest;
    await ensureWorkspaceAccess(request.user.userId, workspaceId(request));
    next();
  })
);

clientsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const request = req as AuthenticatedRequest;
    const search = String(req.query.search ?? "").trim();
    const clients = await prisma.client.findMany({
      where: {
        workspaceId: workspaceId(request),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
                { company: { contains: search, mode: "insensitive" } }
              ]
            }
          : {})
      },
      include: {
        invoices: {
          select: { id: true, amount: true, status: true, dueDate: true }
        }
      },
      orderBy: { createdAt: "desc" }
    });
    res.json(
      clients.map((client) => ({
        ...client,
        createdAt: client.createdAt.toISOString(),
        updatedAt: client.updatedAt.toISOString(),
        invoices: client.invoices.map((invoice) => ({
          ...invoice,
          amount: Number(invoice.amount.toString()),
          dueDate: invoice.dueDate.toISOString()
        }))
      }))
    );
  })
);

clientsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const request = req as AuthenticatedRequest;
    const input = clientSchema.parse(req.body);
    const client = await prisma.client.create({
      data: {
        workspaceId: workspaceId(request),
        name: input.name,
        email: input.email,
        phone: input.phone,
        company: input.company,
        notes: input.notes
      }
    });
    await recordActivity({
      workspaceId: workspaceId(request),
      userId: request.user.userId,
      type: "CLIENT_CREATED",
      title: `${client.name} added`,
      body: client.email,
      entityType: "client",
      entityId: client.id
    });
    res.status(201).json({
      ...client,
      createdAt: client.createdAt.toISOString(),
      updatedAt: client.updatedAt.toISOString()
    });
  })
);

clientsRouter.get(
  "/:clientId",
  asyncHandler(async (req, res) => {
    const request = req as AuthenticatedRequest;
    const client = await prisma.client.findFirst({
      where: {
        id: clientId(request),
        workspaceId: workspaceId(request)
      },
      include: {
        invoices: {
          orderBy: { dueDate: "asc" },
          include: {
            client: true,
            lineItems: true,
            payments: { orderBy: { paidAt: "desc" } },
            attachments: { orderBy: { createdAt: "desc" } },
            reminderLogs: { orderBy: { sentAt: "desc" } }
          }
        }
      }
    });
    if (!client) {
      throw notFound("Client not found");
    }
    res.json({
      ...client,
      createdAt: client.createdAt.toISOString(),
      updatedAt: client.updatedAt.toISOString(),
      invoices: client.invoices.map(serializeInvoice)
    });
  })
);

clientsRouter.put(
  "/:clientId",
  asyncHandler(async (req, res) => {
    const request = req as AuthenticatedRequest;
    const input = clientSchema.parse(req.body);
    const existing = await prisma.client.findFirst({
      where: { id: clientId(request), workspaceId: workspaceId(request) }
    });
    if (!existing) {
      throw notFound("Client not found");
    }
    const client = await prisma.client.update({
      where: { id: clientId(request) },
      data: input
    });
    await recordActivity({
      workspaceId: workspaceId(request),
      userId: request.user.userId,
      type: "CLIENT_UPDATED",
      title: `${client.name} updated`,
      entityType: "client",
      entityId: client.id
    });
    res.json({
      ...client,
      createdAt: client.createdAt.toISOString(),
      updatedAt: client.updatedAt.toISOString()
    });
  })
);

clientsRouter.delete(
  "/:clientId",
  asyncHandler(async (req, res) => {
    const request = req as AuthenticatedRequest;
    const existing = await prisma.client.findFirst({
      where: { id: clientId(request), workspaceId: workspaceId(request) }
    });
    if (!existing) {
      throw notFound("Client not found");
    }
    const invoiceCount = await prisma.invoice.count({
      where: { clientId: existing.id }
    });
    if (invoiceCount > 0) {
      throw badRequest("Clients with invoices cannot be deleted");
    }
    await prisma.client.delete({ where: { id: clientId(request) } });
    res.status(204).send();
  })
);
