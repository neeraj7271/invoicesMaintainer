import { createApp } from "./app.js";
import { config } from "./config.js";
import { startReminderScheduler } from "./jobs/reminderScheduler.js";
import { prisma } from "./lib/prisma.js";

const app = createApp();
const scheduler = startReminderScheduler();

const server = app.listen(config.port, () => {
  console.log(`DueTracker API listening on port ${config.port}`);
});

async function shutdown(signal: string) {
  console.log(`${signal} received. Shutting down DueTracker.`);
  scheduler?.stop();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
