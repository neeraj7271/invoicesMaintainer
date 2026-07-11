export type InvoiceStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID" | "OVERDUE";

export type User = {
  id: string;
  email: string;
  name: string;
};

export type Workspace = {
  id: string;
  name: string;
  legalName?: string | null;
  currency: string;
  role?: "OWNER" | "STAFF";
};

export type Client = {
  id: string;
  workspaceId: string;
  name: string;
  email: string;
  phone?: string | null;
  company?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LineItem = {
  id?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount?: number;
};

export type Payment = {
  id: string;
  amount: number;
  paidAt: string;
  note?: string | null;
  createdAt: string;
};

export type Attachment = {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
  createdAt: string;
};

export type ReminderLog = {
  id: string;
  recipient: string;
  subject: string;
  body: string;
  status: "SENT" | "FAILED" | "SKIPPED";
  providerMessage?: string | null;
  scheduledOffsetDays: number;
  sentAt: string;
};

export type Invoice = {
  id: string;
  workspaceId: string;
  clientId: string;
  invoiceNumber: string;
  amount: number;
  paidAmount: number;
  outstandingAmount: number;
  currency: string;
  issueDate: string;
  dueDate: string;
  description?: string | null;
  status: InvoiceStatus;
  reminderSchedule: number[];
  client?: Client;
  lineItems?: LineItem[];
  payments?: Payment[];
  attachments?: Attachment[];
  reminderLogs?: ReminderLog[];
  createdAt: string;
  updatedAt: string;
};

export type Activity = {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  createdAt: string;
};

export type DashboardData = {
  workspace: Workspace;
  metrics: {
    clientsCount: number;
    invoicesCount: number;
    outstandingCount: number;
    totalOutstanding: number;
    overdueCount: number;
    overdueAmount: number;
    upcomingCount: number;
    upcomingAmount: number;
    paidAmount: number;
  };
  upcomingInvoices: Invoice[];
  overdueInvoices: Invoice[];
  recentActivity: Activity[];
};

export type ReminderTemplate = {
  id: string;
  name: string;
  subject: string;
  body: string;
};

export type SettingsData = {
  workspace: Workspace & {
    defaultReminderSchedule: number[];
    senderName?: string | null;
    senderEmail?: string | null;
    timezone: string;
  };
  template: ReminderTemplate;
};

export type AgingBucket = {
  label: "0-30" | "31-60" | "61-90" | "90+";
  total: number;
  count: number;
  invoices: Array<Invoice & { daysOverdue: number }>;
};

export type AgingReport = {
  buckets: AgingBucket[];
  total: number;
  count: number;
};
