import { useCallback, useEffect, useMemo, useState } from "react";
import { scaleBand, scaleLinear } from "@visx/scale";
import { Bar } from "@visx/shape";
import { BarChart3 } from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { StatusBadge } from "../components/StatusBadge";
import { apiRequest } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { formatDate, formatMoney } from "../lib/format";
import type { AgingBucket, AgingReport } from "../types";

const chartWidth = 760;
const chartHeight = 280;
const margin = { top: 26, right: 20, bottom: 48, left: 18 };
const bucketColor: Record<AgingBucket["label"], string> = {
  "0-30": "#2F6F9F",
  "31-60": "#C98216",
  "61-90": "#B83A4B",
  "90+": "#17212B"
};

function AgingChart({ buckets, currency }: { buckets: AgingBucket[]; currency: string }) {
  const xScale = scaleBand<string>({
    domain: buckets.map((bucket) => bucket.label),
    range: [margin.left, chartWidth - margin.right],
    padding: 0.22
  });
  const maxTotal = Math.max(1, ...buckets.map((bucket) => bucket.total));
  const yScale = scaleLinear<number>({
    domain: [0, maxTotal],
    range: [chartHeight - margin.bottom, margin.top],
    nice: true
  });

  return (
    <svg
      className="h-auto w-full"
      viewBox={`0 0 ${chartWidth} ${chartHeight}`}
      role="img"
      aria-label="Aging report totals by overdue bucket"
    >
      <line
        x1={margin.left}
        y1={chartHeight - margin.bottom}
        x2={chartWidth - margin.right}
        y2={chartHeight - margin.bottom}
        stroke="#C9D6DF"
      />
      {buckets.map((bucket) => {
        const x = xScale(bucket.label) ?? 0;
        const barWidth = xScale.bandwidth();
        const y = yScale(bucket.total);
        const barHeight = chartHeight - margin.bottom - y;
        return (
          <g key={bucket.label}>
            <Bar
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              fill={bucketColor[bucket.label]}
              rx={3}
            />
            <text
              x={x + barWidth / 2}
              y={Math.max(16, y - 8)}
              textAnchor="middle"
              className="fill-ledger font-mono text-[13px] font-semibold"
            >
              {formatMoney(bucket.total, currency)}
            </text>
            <text
              x={x + barWidth / 2}
              y={chartHeight - 18}
              textAnchor="middle"
              className="fill-ledger-muted text-[13px] font-bold"
            >
              {bucket.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function DaysRail({ days }: { days: number }) {
  const width = `${Math.min(100, Math.max(6, days))}%`;
  const color =
    days > 90 ? "bg-night" : days > 60 ? "bg-overdue" : days > 30 ? "bg-marigold" : "bg-clearing";
  return (
    <div className="min-w-36">
      <div className="h-2 overflow-hidden rounded-[3px] bg-line">
        <div className={`h-full ${color}`} style={{ width }} />
      </div>
      <p className="mt-1 font-mono text-xs text-ledger-muted">{days} days overdue</p>
    </div>
  );
}

export function AgingReportPage() {
  const { token, currentWorkspace } = useAuth();
  const [report, setReport] = useState<AgingReport | null>(null);
  const [error, setError] = useState("");

  const loadReport = useCallback(async () => {
    if (!token || !currentWorkspace) {
      return;
    }
    const data = await apiRequest<AgingReport>(
      `/api/workspaces/${currentWorkspace.id}/reports/aging`,
      { token }
    );
    setReport(data);
  }, [currentWorkspace, token]);

  useEffect(() => {
    void loadReport().catch((err) =>
      setError(err instanceof Error ? err.message : "Aging report failed")
    );
  }, [loadReport]);

  const allInvoices = useMemo(
    () => report?.buckets.flatMap((bucket) => bucket.invoices) ?? [],
    [report]
  );

  if (!currentWorkspace) {
    return <EmptyState icon={BarChart3} title="Create a workspace to view aging" />;
  }

  if (error) {
    return (
      <div className="rounded-[4px] border border-overdue/30 bg-overdue/10 p-4 text-overdue">
        {error}
      </div>
    );
  }

  if (!report) {
    return <div className="text-sm text-ledger-muted">Loading aging report...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Aging Report</h1>
        <p className="text-sm text-ledger-muted">
          Overdue invoices grouped by how long payment has been outstanding.
        </p>
      </div>

      <section className="surface grid gap-0 overflow-hidden lg:grid-cols-[1fr_300px]">
        <div className="p-5">
          <AgingChart buckets={report.buckets} currency={currentWorkspace.currency} />
        </div>
        <div className="border-t border-line bg-night p-5 text-white lg:border-l lg:border-t-0">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-white/60">
            Total overdue
          </p>
          <p className="mt-3 font-mono text-4xl font-semibold">
            {formatMoney(report.total, currentWorkspace.currency)}
          </p>
          <p className="mt-2 text-sm text-white/60">
            {report.count} invoice(s) need follow-up
          </p>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-4">
        {report.buckets.map((bucket) => (
          <section
            key={bucket.label}
            className="surface border-l-4 p-4"
            style={{ borderLeftColor: bucketColor[bucket.label] }}
          >
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-ledger-muted">
              {bucket.label} days
            </p>
            <p className="mt-2 font-mono text-2xl font-semibold">
              {formatMoney(bucket.total, currentWorkspace.currency)}
            </p>
            <p className="mt-1 text-sm text-ledger-muted">{bucket.count} invoice(s)</p>
          </section>
        ))}
      </div>

      <section className="surface overflow-hidden">
        <div className="border-b border-line px-4 py-3">
          <h2 className="font-display text-xl font-semibold">Overdue invoice rails</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="ledger-table min-w-[880px]">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Client</th>
                <th>Due</th>
                <th>Age</th>
                <th>Status</th>
                <th>Open</th>
              </tr>
            </thead>
            <tbody>
              {allInvoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-ledger-muted">
                    Nothing is overdue.
                  </td>
                </tr>
              ) : (
                allInvoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-white">
                    <td>
                      <Link
                        to={`/invoices/${invoice.id}`}
                        className="font-mono font-semibold text-clearing"
                      >
                        {invoice.invoiceNumber}
                      </Link>
                    </td>
                    <td>{invoice.client?.name}</td>
                    <td>{formatDate(invoice.dueDate)}</td>
                    <td>
                      <DaysRail days={invoice.daysOverdue} />
                    </td>
                    <td>
                      <StatusBadge status={invoice.status} />
                    </td>
                    <td className="font-mono font-semibold">
                      {formatMoney(invoice.outstandingAmount, invoice.currency)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
