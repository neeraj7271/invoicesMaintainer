import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { FilePlus2, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { StatusBadge } from "../components/StatusBadge";
import { apiRequest } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { formatDate, formatMoney } from "../lib/format";
import type { Client, Invoice, InvoiceStatus } from "../types";

const statuses: Array<"" | InvoiceStatus> = [
  "",
  "UNPAID",
  "PARTIALLY_PAID",
  "OVERDUE",
  "PAID"
];

export function InvoicesPage() {
  const { token, currentWorkspace } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [filters, setFilters] = useState({
    q: "",
    status: "",
    clientId: "",
    startDate: "",
    endDate: ""
  });
  const [error, setError] = useState("");

  const workspacePath = currentWorkspace
    ? `/api/workspaces/${currentWorkspace.id}`
    : "";

  const loadClients = useCallback(async () => {
    if (!token || !currentWorkspace) {
      return;
    }
    const data = await apiRequest<Client[]>(`${workspacePath}/clients`, { token });
    setClients(data);
  }, [currentWorkspace, token, workspacePath]);

  const loadInvoices = useCallback(async () => {
    if (!token || !currentWorkspace) {
      return;
    }
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      }
    });
    const query = params.toString() ? `?${params.toString()}` : "";
    const data = await apiRequest<Invoice[]>(`${workspacePath}/invoices${query}`, {
      token
    });
    setInvoices(data);
  }, [currentWorkspace, filters, token, workspacePath]);

  useEffect(() => {
    void Promise.all([loadClients(), loadInvoices()]).catch((err) =>
      setError(err instanceof Error ? err.message : "Invoices failed")
    );
  }, [loadClients, loadInvoices]);

  function submitFilters(event: FormEvent) {
    event.preventDefault();
    void loadInvoices();
  }

  if (!currentWorkspace) {
    return <EmptyState icon={FilePlus2} title="Create a workspace to add invoices" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Invoices</h1>
          <p className="text-sm text-ledger-muted">
            Search by client, status, invoice number, or due date range.
          </p>
        </div>
        <Link
          to="/invoices/new"
          className="inline-flex items-center gap-2 rounded-[4px] bg-clearing px-4 py-2 text-sm font-semibold text-white hover:bg-clearing-dark"
        >
          <FilePlus2 className="h-4 w-4" aria-hidden="true" />
          New invoice
        </Link>
      </div>

      <form className="surface grid gap-3 p-4 lg:grid-cols-[1fr_180px_190px_150px_150px_auto]" onSubmit={submitFilters}>
        <label className="label">
          Search
          <input
            className="field"
            value={filters.q}
            onChange={(event) =>
              setFilters((value) => ({ ...value, q: event.target.value }))
            }
            placeholder="Invoice, client, description"
          />
        </label>
        <label className="label">
          Status
          <select
            className="field"
            value={filters.status}
            onChange={(event) =>
              setFilters((value) => ({ ...value, status: event.target.value }))
            }
          >
            {statuses.map((status) => (
              <option key={status || "all"} value={status}>
                {status ? status.replace("_", " ") : "All statuses"}
              </option>
            ))}
          </select>
        </label>
        <label className="label">
          Client
          <select
            className="field"
            value={filters.clientId}
            onChange={(event) =>
              setFilters((value) => ({ ...value, clientId: event.target.value }))
            }
          >
            <option value="">All clients</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </label>
        <label className="label">
          From
          <input
            type="date"
            className="field"
            value={filters.startDate}
            onChange={(event) =>
              setFilters((value) => ({ ...value, startDate: event.target.value }))
            }
          />
        </label>
        <label className="label">
          To
          <input
            type="date"
            className="field"
            value={filters.endDate}
            onChange={(event) =>
              setFilters((value) => ({ ...value, endDate: event.target.value }))
            }
          />
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            className="inline-flex h-10 w-10 items-center justify-center rounded-[4px] bg-clearing text-white"
            title="Apply filters"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </form>

      {error ? (
        <p className="rounded-[4px] border border-overdue/30 bg-overdue/10 p-3 text-sm text-overdue">
          {error}
        </p>
      ) : null}

      <section className="surface overflow-hidden">
        {invoices.length === 0 ? (
          <EmptyState icon={FilePlus2} title="No invoices match these filters" />
        ) : (
          <div className="overflow-x-auto">
            <table className="ledger-table min-w-[920px]">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Client</th>
                  <th>Due date</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th>Open</th>
                  <th>Reminder schedule</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-white">
                    <td>
                      <Link
                        to={`/invoices/${invoice.id}`}
                        className="font-mono font-semibold text-clearing hover:text-clearing-dark"
                      >
                        {invoice.invoiceNumber}
                      </Link>
                      <p className="max-w-xs truncate text-sm text-ledger-muted">
                        {invoice.description || "No description"}
                      </p>
                    </td>
                    <td>
                      {invoice.client ? (
                        <Link
                          to={`/clients/${invoice.client.id}`}
                          className="font-semibold"
                        >
                          {invoice.client.name}
                        </Link>
                      ) : (
                        "Unknown"
                      )}
                      <p className="text-sm text-ledger-muted">
                        {invoice.client?.company || invoice.client?.email}
                      </p>
                    </td>
                    <td>{formatDate(invoice.dueDate)}</td>
                    <td>
                      <StatusBadge status={invoice.status} />
                    </td>
                    <td className="font-mono">
                      {formatMoney(invoice.amount, invoice.currency)}
                    </td>
                    <td className="font-mono font-semibold">
                      {formatMoney(invoice.outstandingAmount, invoice.currency)}
                    </td>
                    <td className="font-mono text-sm text-ledger-muted">
                      {invoice.reminderSchedule.length > 0
                        ? invoice.reminderSchedule.join(", ")
                        : "workspace default"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
