import { Router } from "express";
import { z } from "zod";
import { config, isProduction } from "../config.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { badRequest, unauthorized } from "../lib/errors.js";
import {
  createResetToken,
  hashPassword,
  hashResetToken,
  signToken,
  validatePassword,
  verifyPassword
} from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import { recordActivity } from "../lib/activity.js";
import { ensureDefaultTemplate } from "../lib/reminders.js";
import { sendEmail } from "../email/mailer.js";

export const authRouter = Router();

const signupSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  businessName: z.string().min(1).optional()
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const requestResetSchema = z.object({
  email: z.string().email()
});

const confirmResetSchema = z.object({
  token: z.string().min(32),
  password: z.string().min(8)
});

async function authResponse(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      memberships: {
        include: { workspace: true },
        orderBy: { createdAt: "asc" }
      }
    }
  });

  return {
    token: signToken({ userId: user.id, email: user.email }),
    user: {
      id: user.id,
      email: user.email,
      name: user.name
    },
    workspaces: user.memberships.map((membership) => ({
      id: membership.workspace.id,
      name: membership.workspace.name,
      legalName: membership.workspace.legalName,
      currency: membership.workspace.currency,
      role: membership.role
    }))
  };
}

authRouter.post(
  "/signup",
  asyncHandler(async (req, res) => {
    const input = signupSchema.parse(req.body);
    if (!validatePassword(input.password)) {
      throw badRequest("Password must be at least 8 characters long");
    }

    const existing = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() }
    });
    if (existing) {
      throw badRequest("An account with this email already exists");
    }

    const passwordHash = await hashPassword(input.password);
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email.toLowerCase(),
        passwordHash,
        memberships: {
          create: {
            role: "OWNER",
            workspace: {
              create: {
                name: input.businessName ?? `${input.name}'s Workspace`,
                currency: "USD"
              }
            }
          }
        }
      },
      include: {
        memberships: {
          include: { workspace: true }
        }
      }
    });

    const workspace = user.memberships[0]?.workspace;
    if (workspace) {
      await ensureDefaultTemplate(workspace.id);
      await recordActivity({
        workspaceId: workspace.id,
        userId: user.id,
        type: "WORKSPACE_CREATED",
        title: `${workspace.name} created`,
        entityType: "workspace",
        entityId: workspace.id
      });
    }

    res.status(201).json(await authResponse(user.id));
  })
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const input = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() }
    });
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      throw unauthorized("Invalid email or password");
    }

    res.json(await authResponse(user.id));
  })
);

authRouter.post(
  "/password-reset/request",
  asyncHandler(async (req, res) => {
    const input = requestResetSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() }
    });

    if (!user) {
      res.json({ ok: true });
      return;
    }

    const reset = createResetToken();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetTokenHash: reset.tokenHash,
        resetTokenExpiresAt: reset.expiresAt
      }
    });

    const resetUrl = `${config.appUrl}/password-reset?token=${reset.token}`;
    await sendEmail({
      to: user.email,
      subject: "Reset your DueTracker password",
      html: `Hi ${user.name},<br><br>Use this link to reset your password:<br><a href="${resetUrl}">${resetUrl}</a><br><br>This link expires in 30 minutes.`
    });

    res.json({
      ok: true,
      resetToken: isProduction ? undefined : reset.token
    });
  })
);

authRouter.post(
  "/password-reset/confirm",
  asyncHandler(async (req, res) => {
    const input = confirmResetSchema.parse(req.body);
    const tokenHash = hashResetToken(input.token);
    const user = await prisma.user.findFirst({
      where: {
        resetTokenHash: tokenHash,
        resetTokenExpiresAt: { gt: new Date() }
      }
    });
    if (!user) {
      throw badRequest("Reset link is invalid or expired");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(input.password),
        resetTokenHash: null,
        resetTokenExpiresAt: null
      }
    });

    res.json(await authResponse(user.id));
  })
);
