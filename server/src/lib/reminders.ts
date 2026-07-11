import type { Invoice, ReminderTemplate, Workspace } from "@prisma/client";
import { prisma } from "./prisma.js";
import { sendEmail } from "../email/mailer.js";
import { computeInvoiceStatus, decimalToNumber } from "./invoices.js";
import { recordActivity } from "./activity.js";

type InvoiceForReminder = Invoice & {
  client: {
    id: string;
    name: string;
    email: string;
    company: string | null;
  };
  workspace: Workspace & {
    reminderTemplates: ReminderTemplate[];
  };
};

export const defaultReminderTemplate = {
  name: "Default email reminder",
  subject: "Invoice {invoice_number} is due {due_date}",
  body:
    "Hi {client_name},<br><br>This is a reminder for invoice {invoice_number} for {amount}, due on {due_date}.<br><br>Thank you."
};

export function renderTemplate(
  template: string,
  variables: Record<string, string>
) {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    return variables[key] ?? match;
  });
}

export function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function dateOnly(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number) {
  const next = dateOnly(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function isSameCalendarDay(a: Date, b: Date) {
  return dateOnly(a).getTime() === dateOnly(b).getTime();
}

export function shouldSendForOffset(
  dueDate: Date,
  offsetDays: number,
  referenceDate = new Date()
) {
  return isSameCalendarDay(addDays(dueDate, offsetDays), referenceDate);
}

export function effectiveSchedule(invoice: Invoice, workspace: Workspace) {
  return invoice.reminderSchedule.length > 0
    ? invoice.reminderSchedule
    : workspace.defaultReminderSchedule;
}

function variablesForInvoice(invoice: InvoiceForReminder) {
  return {
    client_name: invoice.client.name,
    client_company: invoice.client.company ?? invoice.client.name,
    invoice_number: invoice.invoiceNumber,
    amount: formatMoney(decimalToNumber(invoice.amount), invoice.currency),
    due_date: invoice.dueDate.toISOString().slice(0, 10),
    issue_date: invoice.issueDate.toISOString().slice(0, 10),
    workspace_name: invoice.workspace.name
  };
}

export async function ensureDefaultTemplate(workspaceId: string) {
  const existing = await prisma.reminderTemplate.findFirst({
    where: { workspaceId, channel: "EMAIL" },
    orderBy: { createdAt: "asc" }
  });

  if (existing) {
    return existing;
  }

  return prisma.reminderTemplate.create({
    data: {
      workspaceId,
      channel: "EMAIL",
      ...defaultReminderTemplate
    }
  });
}

export async function sendInvoiceReminder(input: {
  invoiceId: string;
  offsetDays: number;
  userId?: string;
}) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: input.invoiceId },
    include: {
      client: true,
      workspace: {
        include: {
          reminderTemplates: {
            where: { channel: "EMAIL" },
            orderBy: { createdAt: "asc" }
          }
        }
      }
    }
  });

  if (!invoice) {
    throw new Error("Invoice not found");
  }

  if (computeInvoiceStatus(invoice) === "PAID") {
    return prisma.reminderLog.create({
      data: {
        invoiceId: invoice.id,
        workspaceId: invoice.workspaceId,
        recipient: invoice.client.email,
        subject: "Reminder skipped",
        body: "Invoice is already paid.",
        status: "SKIPPED",
        providerMessage: "Invoice was paid before reminder send.",
        scheduledOffsetDays: input.offsetDays
      }
    });
  }

  const template = invoice.workspace.reminderTemplates[0] ?? {
    id: "",
    workspaceId: invoice.workspaceId,
    channel: "EMAIL" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...defaultReminderTemplate
  };

  const variables = variablesForInvoice(invoice);
  const subject = renderTemplate(template.subject, variables);
  const body = renderTemplate(template.body, variables);
  const from =
    invoice.workspace.senderEmail && invoice.workspace.senderName
      ? `${invoice.workspace.senderName} <${invoice.workspace.senderEmail}>`
      : invoice.workspace.senderEmail ?? undefined;

  try {
    const result = await sendEmail({
      to: invoice.client.email,
      subject,
      html: body,
      from
    });
    const log = await prisma.reminderLog.create({
      data: {
        invoiceId: invoice.id,
        workspaceId: invoice.workspaceId,
        recipient: invoice.client.email,
        subject,
        body,
        status: "SENT",
        providerMessage: result.messageId ?? result.response,
        scheduledOffsetDays: input.offsetDays
      }
    });
    await recordActivity({
      workspaceId: invoice.workspaceId,
      userId: input.userId,
      type: "REMINDER_SENT",
      title: `Reminder sent for ${invoice.invoiceNumber}`,
      body: `Email sent to ${invoice.client.email}`,
      entityType: "invoice",
      entityId: invoice.id
    });
    return log;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Email provider failed";
    return prisma.reminderLog.create({
      data: {
        invoiceId: invoice.id,
        workspaceId: invoice.workspaceId,
        recipient: invoice.client.email,
        subject,
        body,
        status: "FAILED",
        providerMessage: message,
        scheduledOffsetDays: input.offsetDays
      }
    });
  }
}

export async function runReminderSweep(referenceDate = new Date()) {
  const invoices = await prisma.invoice.findMany({
    where: {
      status: { not: "PAID" }
    },
    include: {
      workspace: {
        include: {
          reminderTemplates: {
            where: { channel: "EMAIL" },
            orderBy: { createdAt: "asc" }
          }
        }
      },
      client: true,
      reminderLogs: true
    }
  });

  const results: Array<{
    invoiceId: string;
    offsetDays: number;
    status: "SENT" | "FAILED" | "SKIPPED";
  }> = [];

  for (const invoice of invoices) {
    const schedule = effectiveSchedule(invoice, invoice.workspace);
    for (const offsetDays of schedule) {
      const alreadySent = invoice.reminderLogs.some(
        (log) => log.scheduledOffsetDays === offsetDays
      );
      if (alreadySent || !shouldSendForOffset(invoice.dueDate, offsetDays, referenceDate)) {
        continue;
      }

      const log = await sendInvoiceReminder({
        invoiceId: invoice.id,
        offsetDays
      });
      results.push({
        invoiceId: invoice.id,
        offsetDays,
        status: log.status
      });
    }
  }

  return results;
}
