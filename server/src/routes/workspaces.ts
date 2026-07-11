import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { prisma } from "../lib/prisma.js";
import { recordActivity } from "../lib/activity.js";
import { ensureDefaultTemplate } from "../lib/reminders.js";
import {
  ensureWorkspaceAccess,
  type AuthenticatedRequest
} from "../middleware/auth.js";

export const workspacesRouter = Router();

const workspaceSchema = z.object({
  name: z.string().min(1),
  legalName: z.string().optional().nullable(),
  currency: z.string().min(3).max(3).default("USD")
});

function workspaceId(req: AuthenticatedRequest) {
  return req.params.workspaceId as string;
}

workspacesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user;
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: user.userId },
      include: { workspace: true },
      orderBy: { createdAt: "asc" }
    });

    res.json(
      memberships.map((membership) => ({
        id: membership.workspace.id,
        name: membership.workspace.name,
        legalName: membership.workspace.legalName,
        currency: membership.workspace.currency,
        role: membership.role
      }))
    );
  })
);

workspacesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user;
    const input = workspaceSchema.parse(req.body);
    const workspace = await prisma.workspace.create({
      data: {
        name: input.name,
        legalName: input.legalName,
        currency: input.currency.toUpperCase(),
        members: {
          create: {
            userId: user.userId,
            role: "OWNER"
          }
        }
      }
    });
    await ensureDefaultTemplate(workspace.id);
    await recordActivity({
      workspaceId: workspace.id,
      userId: user.userId,
      type: "WORKSPACE_CREATED",
      title: `${workspace.name} created`,
      entityType: "workspace",
      entityId: workspace.id
    });
    res.status(201).json(workspace);
  })
);

workspacesRouter.get(
  "/:workspaceId",
  asyncHandler(async (req, res) => {
    const request = req as AuthenticatedRequest;
    const membership = await ensureWorkspaceAccess(
      request.user.userId,
      workspaceId(request)
    );
    res.json(membership.workspace);
  })
);

workspacesRouter.put(
  "/:workspaceId",
  asyncHandler(async (req, res) => {
    const request = req as AuthenticatedRequest;
    await ensureWorkspaceAccess(request.user.userId, workspaceId(request));
    const input = workspaceSchema.parse(req.body);
    const workspace = await prisma.workspace.update({
      where: { id: workspaceId(request) },
      data: {
        name: input.name,
        legalName: input.legalName,
        currency: input.currency.toUpperCase()
      }
    });
    await recordActivity({
      workspaceId: workspace.id,
      userId: request.user.userId,
      type: "SETTINGS_UPDATED",
      title: `${workspace.name} profile updated`,
      entityType: "workspace",
      entityId: workspace.id
    });
    res.json(workspace);
  })
);
