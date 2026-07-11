import type { ActivityType } from "@prisma/client";
import { prisma } from "./prisma.js";

export async function recordActivity(input: {
  workspaceId: string;
  userId?: string;
  type: ActivityType;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: string;
}) {
  return prisma.activity.create({
    data: {
      workspaceId: input.workspaceId,
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      entityType: input.entityType,
      entityId: input.entityId
    }
  });
}
