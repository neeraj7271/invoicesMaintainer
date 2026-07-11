import type {
  Attachment,
  Client,
  Invoice,
  LineItem,
  Payment,
  ReminderLog
} from "@prisma/client";

export type InvoiceWithRelations = Invoice & {
  client?: Client;
  lineItems?: LineItem[];
  payments?: Payment[];
  attachments?: Attachment[];
  reminderLogs?: ReminderLog[];
};

export type InvoiceStatusView =
  | "UNPAID"
  | "PARTIALLY_PAID"
  | "PAID"
  | "OVERDUE";

export function startOfToday(referenceDate = new Date()) {
  return new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );
}

export function computeInvoiceStatus(
  invoice: Pick<Invoice, "status" | "dueDate">,
  referenceDate = new Date()
): InvoiceStatusView {
  if (invoice.status === "PAID") {
    return "PAID";
  }

  const dueDate = new Date(invoice.dueDate);
  const today = startOfToday(referenceDate);
  const dueDay = new Date(
    dueDate.getFullYear(),
    dueDate.getMonth(),
    dueDate.getDate()
  );

  if (dueDay < today) {
    return "OVERDUE";
  }

  if (invoice.status === "PARTIALLY_PAID") {
    return "PARTIALLY_PAID";
  }

  return "UNPAID";
}

export function decimalToNumber(value: { toString(): string } | number) {
  return typeof value === "number" ? value : Number(value.toString());
}

export function paidTotal(invoice: Pick<InvoiceWithRelations, "payments">) {
  return (invoice.payments ?? []).reduce(
    (sum, payment) => sum + decimalToNumber(payment.amount),
    0
  );
}

export function outstandingAmount(
  invoice: Pick<InvoiceWithRelations, "amount" | "payments" | "status">
) {
  if (invoice.status === "PAID") {
    return 0;
  }
  return Math.max(decimalToNumber(invoice.amount) - paidTotal(invoice), 0);
}

export function serializeInvoice(invoice: InvoiceWithRelations) {
  const paidAmount = paidTotal(invoice);
  const amount = decimalToNumber(invoice.amount);

  return {
    ...invoice,
    amount,
    paidAmount,
    outstandingAmount: Math.max(amount - paidAmount, 0),
    status: computeInvoiceStatus(invoice),
    issueDate: invoice.issueDate.toISOString(),
    dueDate: invoice.dueDate.toISOString(),
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
    lineItems: invoice.lineItems?.map((item) => ({
      ...item,
      quantity: decimalToNumber(item.quantity),
      unitPrice: decimalToNumber(item.unitPrice),
      amount: decimalToNumber(item.amount),
      createdAt: item.createdAt.toISOString()
    })),
    payments: invoice.payments?.map((payment) => ({
      ...payment,
      amount: decimalToNumber(payment.amount),
      paidAt: payment.paidAt.toISOString(),
      createdAt: payment.createdAt.toISOString()
    })),
    attachments: invoice.attachments?.map((attachment) => ({
      ...attachment,
      createdAt: attachment.createdAt.toISOString()
    })),
    reminderLogs: invoice.reminderLogs?.map((log) => ({
      ...log,
      sentAt: log.sentAt.toISOString()
    }))
  };
}

export function calculateLineItemAmount(input: {
  quantity: number;
  unitPrice: number;
}) {
  return Number((input.quantity * input.unitPrice).toFixed(2));
}

export function normalizeSchedule(input: unknown, fallback: number[]) {
  if (!Array.isArray(input)) {
    return fallback;
  }

  const values = input
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= -30 && value <= 365);
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

export function agingBucketForDays(daysOverdue: number) {
  if (daysOverdue <= 30) {
    return "0-30";
  }
  if (daysOverdue <= 60) {
    return "31-60";
  }
  if (daysOverdue <= 90) {
    return "61-90";
  }
  return "90+";
}
