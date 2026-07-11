import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { prisma } from "../lib/prisma.js";
import { recordActivity } from "../lib/activity.js";
import { defaultReminderTemplate, ensureDefaultTemplate } from "../lib/reminders.js";
import { normalizeSchedule } from "../lib/invoices.js";
import {
  ensureWorkspaceAccess,
  type AuthenticatedRequest
} from "../middleware/auth.js";

export const settingsRouter = Router({ mergeParams: true });

const settingsSchema = z.object({
  name: z.string().min(1),
  legalName: z.string().optional().nullable(),
  currency: z.string().min(3).max(3),
  defaultReminderSchedule: z.array(z.coerce.number().int()),
  senderName: z.string().optional().nullable(),
  senderEmail: z.string().email().optional().nullable(),
  timezone: z.string().min(1).default("UTC"),
  template: z.object({
    id: z.string().optional(),
    name: z.string().min(1).default(defaultReminderTemplate.name),
    subject: z.string().min(1),
    body: z.string().min(1)
  })
});

function workspaceId(req: AuthenticatedRequest) {
  return req.params.workspaceId as string;
}

settingsRouter.use(
  asyncHandler(async (req, _res, next) => {
    const request = req as AuthenticatedRequest;
    await ensureWorkspaceAccess(request.user.userId, workspaceId(request));
    next();
  })
);

settingsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const request = req as AuthenticatedRequest;
    const currentWorkspaceId = workspaceId(request);
    const template = await ensureDefaultTemplate(currentWorkspaceId);
    const workspace = await prisma.workspace.findUniqueOrThrow({
      where: { id: currentWorkspaceId }
    });
    res.json({
      workspace,
      template
    });
  })
);

settingsRouter.put(
  "/",
  asyncHandler(async (req, res) => {
    const request = req as AuthenticatedRequest;
    const input = settingsSchema.parse(req.body);
    const schedule = normalizeSchedule(input.defaultReminderSchedule, [
      -3,
      0,
      3,
      7,
      14
    ]);

    const workspace = await prisma.workspace.update({
      where: { id: workspaceId(request) },
      data: {
        name: input.name,
        legalName: input.legalName,
        currency: input.currency.toUpperCase(),
        defaultReminderSchedule: schedule,
        senderName: input.senderName,
        senderEmail: input.senderEmail,
        timezone: input.timezone
      }
    });

    const existingTemplate = await ensureDefaultTemplate(workspace.id);
    const template = await prisma.reminderTemplate.update({
      where: { id: input.template.id ?? existingTemplate.id },
      data: {
        name: input.template.name,
        subject: input.template.subject,
        body: input.template.body
      }
    });

    await recordActivity({
      workspaceId: workspace.id,
      userId: request.user.userId,
      type: "SETTINGS_UPDATED",
      title: `${workspace.name} settings updated`,
      entityType: "workspace",
      entityId: workspace.id
    });

    res.json({ workspace, template });
  })
);
