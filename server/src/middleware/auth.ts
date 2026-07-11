import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { forbidden, unauthorized } from "../lib/errors.js";
import { verifyToken, type JwtPayload } from "../lib/auth.js";

export type AuthenticatedUser = JwtPayload & {
  name: string;
};

export type AuthenticatedRequest = Request & {
  user: AuthenticatedUser;
};

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw unauthorized();
    }

    const token = header.slice("Bearer ".length);
    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, name: true }
    });
    if (!user) {
      throw unauthorized("Invalid session");
    }

    (req as AuthenticatedRequest).user = {
      userId: user.id,
      email: user.email,
      name: user.name
    };
    next();
  } catch (error) {
    next(error instanceof Error ? unauthorized(error.message) : unauthorized());
  }
}

export async function ensureWorkspaceAccess(userId: string, workspaceId: string) {
  const membership = await prisma.workspaceMember.findUnique({
    where: {
      userId_workspaceId: { userId, workspaceId }
    },
    include: { workspace: true }
  });

  if (!membership) {
    throw forbidden();
  }

  return membership;
}
