import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Building2, ClipboardList, Mail, Phone } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { StatusBadge } from "../components/StatusBadge";
import { apiRequest } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { formatDate, formatMoney } from "../lib/format";
import type { Client, Invoice } from "../types";

type ClientDetail = Client & {
  invoices: Invoice[];
};

export function ClientDetailPage() {
  const { clientId } = useParams();
  const { token, currentWorkspace } = useAuth();
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [error, setError] = useState("");

  const loadClient = useCallback(async () => {
    if (!token || !currentWorkspace || !clientId) {
      return;
    }
    const data = await apiRequest<ClientDetail>(
      `/api/workspaces/${currentWorkspace.id}/clients/${clientId}`,
      { token }
    );
    setClient(data);
  }, [clientId, currentWorkspace, token]);

  useEffect(() => {
    void loadClient().catch((err) =>
      setError(err instanceof Error ? err.message : "Client failed")
    );
  }, [loadClient]);

  if (error) {
    return (
      <div className="rounded-[4px] border border-overdue/30 bg-overdue/10 p-4 text-overdue">
        {error}
      </div>
    );
  }

  if (!client || !currentWorkspace) {
    return <div className="text-sm text-ledger-muted">Loading client...</div>;
  }

  const openInvoices = client.invoices.filter((invoice) => invoice.status !== "PAID");
  const outstanding = openInvoices.reduce(
    (sum, invoice) => sum + Number(invoice.outstandingAmount ?? invoice.amount),
    0
  );

  return (
    <div className="space-y-6">
      <Link
        to="/clients"
        className="inline-flex items-center gap-2 text-sm font-semibold text-clearing"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Clients
      </Link>

      <section className="surface grid overflow-hidden lg:grid-cols-[1fr_320px]">
        <div className="p-5">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-ledger-muted">
            Client ledger
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold">{client.name}</h1>
          <p className="mt-1 text-ledger-muted">{client.notes || "No notes saved."}</p>
          <div className="mt-5 grid gap-3 text-sm md:grid-cols-3">
            <span className="inline-flex items-center gap-2">
              <Mail className="h-4 w-4 text-clearing" aria-hidden="true" />
              {client.email}
            </span>
            <span className="inline-flex items-center gap-2">
              <Phone className="h-4 w-4 text-clearing" aria-hidden="true" />
              {client.phone || "No phone"}
            </span>
            <span className="inline-flex items-center gap-2">
              <Building2 className="h-4 w-4 text-clearing" aria-hidden="true" />
              {client.company || "No company"}
            </span>
          </div>
        </div>
        <div className="border-t border-line bg-night p-5 text-white lg:border-l lg:border-t-0">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-white/60">
            Outstanding
          </p>
          <p className="mt-3 font-mono text-4xl font-semibold">
            {formatMoney(outstanding, currentWorkspace.currency)}
          </p>
          <p className="mt-2 text-sm text-white/60">
            {openInvoices.length} open invoice(s)
          </p>
        </div>
      </section>

      <section className="surface overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="font-display text-xl font-semibold">Invoices</h2>
          <Link
            to="/invoices/new"
            className="inline-flex items-center gap-2 rounded-[4px] bg-clearing px-3 py-2 text-sm font-semibold text-white"
          >
            <ClipboardList className="h-4 w-4" aria-hidden="true" />
            New invoice
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="ledger-table min-w-[760px]">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Due</th>
                <th>Status</th>
                <th>Amount</th>
                <th>Open</th>
              </tr>
            </thead>
            <tbody>
              {client.invoices.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-ledger-muted">
                    No invoices for this client.
                  </td>
                </tr>
              ) : (
                client.invoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-white">
                    <td>
                      <Link
                        to={`/invoices/${invoice.id}`}
                        className="font-mono font-semibold text-clearing"
                      >
                        {invoice.invoiceNumber}
                      </Link>
                      <p className="text-sm text-ledger-muted">
                        {invoice.description || "No description"}
                      </p>
                    </td>
                    <td>{formatDate(invoice.dueDate)}</td>
                    <td>
                      <StatusBadge status={invoice.status} />
                    </td>
                    <td className="font-mono">
                      {formatMoney(Number(invoice.amount), invoice.currency)}
                    </td>
                    <td className="font-mono font-semibold">
                      {formatMoney(
                        Number(invoice.outstandingAmount ?? invoice.amount),
                        invoice.currency
                      )}
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
