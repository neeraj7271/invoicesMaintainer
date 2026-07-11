import cron from "node-cron";
import { config } from "../config.js";
import { runReminderSweep } from "../lib/reminders.js";

export function startReminderScheduler() {
  if (process.env.NODE_ENV === "test") {
    return undefined;
  }

  const task = cron.schedule(config.reminderCron, async () => {
    try {
      const results = await runReminderSweep();
      console.log(`Reminder sweep complete: ${results.length} action(s).`);
    } catch (error) {
      console.error("Reminder sweep failed", error);
    }
  });

  return task;
}
