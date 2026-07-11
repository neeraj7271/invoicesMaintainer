import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Users
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Link } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { StatCard } from "../components/StatCard";
import { StatusBadge } from "../components/StatusBadge";
import { apiRequest } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { daysBetween, formatDate, formatMoney } from "../lib/format";
import type { DashboardData, Invoice } from "../types";

function overdueDays(invoice: Invoice) {
  return Math.max(0, daysBetween(new Date(invoice.dueDate), new Date()));
}

function PressureRail({
  value,
  label,
  tone = "overdue"
}: {
  value: number;
  label: string;
  tone?: "overdue" | "marigold" | "paid";
}) {
  const reduceMotion = useReducedMotion();
  const width = `${Math.min(100, Math.max(2, value))}%`;
  const color =
    tone === "paid" ? "bg-paid" : tone === "marigold" ? "bg-marigold" : "bg-overdue";

  return (
    <div>
      <div className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.06em] text-ledger-muted">
        <span>{label}</span>
        <span className="font-mono">{Math.round(value)}%</span>
      </div>
      <div className="mt-2 h-3 overflow-hidden rounded-[3px] bg-line">
        <motion.div
          className={`h-full ${color}`}
          initial={{ width: reduceMotion ? width : "2%" }}
          animate={{ width }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { token, currentWorkspace } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token || !currentWorkspace) {
      return;
    }
    void apiRequest<DashboardData>(
      `/api/workspaces/${currentWorkspace.id}/dashboard`,
      { token }
    )
      .then(setData)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Dashboard failed")
      );
  }, [currentWorkspace, token]);

  if (!currentWorkspace) {
    return <EmptyState icon={Users} title="Create a workspace to begin" />;
  }

  if (error) {
    return (
      <div className="rounded-[4px] border border-overdue/30 bg-overdue/10 p-4 text-overdue">
        {error}
      </div>
    );
  }

  if (!data) {
    return <div className="text-sm text-ledger-muted">Loading dashboard...</div>;
  }

  const overduePercent =
    data.metrics.totalOutstanding > 0
      ? (data.metrics.overdueAmount / data.metrics.totalOutstanding) * 100
      : 0;
  const oldestOverdueDays = data.overdueInvoices.reduce(
    (max, invoice) => Math.max(max, overdueDays(invoice)),
    0
  );
  const overdueWithReminder = data.overdueInvoices.filter(
    (invoice) => (invoice.reminderLogs?.length ?? 0) > 0
  ).length;
  const reminderCoverage =
    data.overdueInvoices.length > 0
      ? (overdueWithReminder / data.overdueInvoices.length) * 100
      : 100;
  const actionInvoices = [...data.overdueInvoices, ...data.upcomingInvoices].slice(
    0,
    10
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-normal">
            Receivables Command
          </h1>
          <p className="text-sm text-ledger-muted">{data.workspace.name}</p>
        </div>
        <Link
          to="/invoices/new"
          className="rounded-[4px] bg-clearing px-4 py-2 text-sm font-semibold text-white hover:bg-clearing-dark"
        >
          New invoice
        </Link>
      </div>

      <section className="surface grid gap-0 overflow-hidden lg:grid-cols-[1.05fr_0.95fr]">
        <div className="bg-night p-5 text-white">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-white/60">
            Overdue exposure
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-3">
            <p className="font-mono text-4xl font-semibold">
              {formatMoney(data.metrics.overdueAmount, currentWorkspace.currency)}
            </p>
            <div>
              <p className="font-mono text-2xl font-semibold">{oldestOverdueDays}d</p>
              <p className="text-xs text-white/60">oldest unpaid invoice</p>
            </div>
          </div>
          <div className="mt-6 max-w-xl">
            <PressureRail value={overduePercent} label="Outstanding already late" />
          </div>
        </div>
        <div className="grid gap-5 p-5">
          <PressureRail
            value={reminderCoverage}
            label="Overdue invoices with reminder history"
            tone="paid"
          />
          <div className="grid grid-cols-2 gap-4">
            <div className="border-l-4 border-clearing bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-[0.06em] text-ledger-muted">
                This week
              </p>
              <p className="mt-2 font-mono text-2xl font-semibold">
                {formatMoney(data.metrics.upcomingAmount, currentWorkspace.currency)}
              </p>
            </div>
            <div className="border-l-4 border-marigold bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-[0.06em] text-ledger-muted">
                Open invoices
              </p>
              <p className="mt-2 font-mono text-2xl font-semibold">
                {data.metrics.outstandingCount}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={ClipboardList}
          label="Outstanding"
          value={formatMoney(
            data.metrics.totalOutstanding,
            currentWorkspace.currency
          )}
          subtext={`${data.metrics.outstandingCount} open invoice(s)`}
        />
        <StatCard
          icon={AlertTriangle}
          label="Overdue"
          value={formatMoney(data.metrics.overdueAmount, currentWorkspace.currency)}
          subtext={`${data.metrics.overdueCount} invoice(s)`}
          tone="red"
        />
        <StatCard
          icon={CalendarClock}
          label="Due this week"
          value={formatMoney(
            data.metrics.upcomingAmount,
            currentWorkspace.currency
          )}
          subtext={`${data.metrics.upcomingCount} upcoming`}
          tone="amber"
        />
        <StatCard
          icon={CheckCircle2}
          label="Paid"
          value={formatMoney(data.metrics.paidAmount, currentWorkspace.currency)}
          subtext={`${data.metrics.clientsCount} client(s)`}
          tone="green"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="surface overflow-hidden">
          <div className="border-b border-line px-4 py-3">
            <h2 className="font-display text-xl font-semibold">
              Invoices needing action
            </h2>
          </div>
          <div className="divide-y divide-line/70">
            {actionInvoices.length === 0 ? (
              <div className="p-4 text-sm text-ledger-muted">No upcoming dues.</div>
            ) : (
              actionInvoices.map((invoice) => (
                <Link
                  key={invoice.id}
                  to={`/invoices/${invoice.id}`}
                  className="grid gap-3 px-4 py-3 hover:bg-white md:grid-cols-[1fr_auto_auto]"
                >
                  <div>
                    <p className="font-medium">{invoice.invoiceNumber}</p>
                    <p className="text-sm text-ledger-muted">
                      {invoice.client?.name} - due {formatDate(invoice.dueDate)}
                    </p>
                  </div>
                  <StatusBadge status={invoice.status} />
                  <p className="font-mono font-semibold">
                    {formatMoney(invoice.outstandingAmount, invoice.currency)}
                  </p>
                </Link>
              ))
            )}
          </div>
        </section>

        <section className="surface overflow-hidden">
          <div className="border-b border-line px-4 py-3">
            <h2 className="font-display text-xl font-semibold">Recent activity</h2>
          </div>
          <div className="divide-y divide-line/70">
            {data.recentActivity.length === 0 ? (
              <div className="p-4 text-sm text-ledger-muted">No activity yet.</div>
            ) : (
              data.recentActivity.map((activity) => (
                <div key={activity.id} className="px-4 py-3">
                  <p className="text-sm font-medium">{activity.title}</p>
                  <p className="text-xs text-ledger-muted">
                    {formatDate(activity.createdAt)}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
