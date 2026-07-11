import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Edit2, Search, Trash2, UserPlus } from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { StatusBadge } from "../components/StatusBadge";
import { apiRequest, jsonBody } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { formatDate, formatMoney } from "../lib/format";
import type { Client, InvoiceStatus } from "../types";

type ClientListItem = Client & {
  invoices?: Array<{
    id: string;
    amount: number | string;
    status: InvoiceStatus;
    dueDate: string;
  }>;
};

const blankForm = {
  name: "",
  email: "",
  phone: "",
  company: "",
  notes: ""
};

function openInvoiceTotal(client: ClientListItem) {
  return (client.invoices ?? [])
    .filter((invoice) => invoice.status !== "PAID")
    .reduce((sum, invoice) => sum + Number(invoice.amount), 0);
}

export function ClientsPage() {
  const { token, currentWorkspace } = useAuth();
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(blankForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const workspacePath = currentWorkspace
    ? `/api/workspaces/${currentWorkspace.id}`
    : "";

  const loadClients = useCallback(async () => {
    if (!token || !currentWorkspace) {
      return;
    }
    const params = new URLSearchParams();
    if (search.trim()) {
      params.set("search", search.trim());
    }
    const query = params.toString() ? `?${params.toString()}` : "";
    const data = await apiRequest<ClientListItem[]>(
      `${workspacePath}/clients${query}`,
      { token }
    );
    setClients(data);
  }, [currentWorkspace, search, token, workspacePath]);

  useEffect(() => {
    void loadClients().catch((err) =>
      setError(err instanceof Error ? err.message : "Clients failed")
    );
  }, [loadClients]);

  const editingClient = useMemo(
    () => clients.find((client) => client.id === editingId) ?? null,
    [clients, editingId]
  );

  function startEdit(client: ClientListItem) {
    setEditingId(client.id);
    setForm({
      name: client.name,
      email: client.email,
      phone: client.phone ?? "",
      company: client.company ?? "",
      notes: client.notes ?? ""
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(blankForm);
  }

  async function submitClient(event: FormEvent) {
    event.preventDefault();
    if (!token || !currentWorkspace) {
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        name: form.name,
        email: form.email,
        phone: form.phone || null,
        company: form.company || null,
        notes: form.notes || null
      };
      if (editingId) {
        await apiRequest(`${workspacePath}/clients/${editingId}`, {
          method: "PUT",
          token,
          body: jsonBody(payload)
        });
        setNotice("Client updated.");
      } else {
        await apiRequest(`${workspacePath}/clients`, {
          method: "POST",
          token,
          body: jsonBody(payload)
        });
        setNotice("Client created.");
      }
      resetForm();
      await loadClients();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Client save failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteClient(client: ClientListItem) {
    if (!token || !currentWorkspace) {
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiRequest(`${workspacePath}/clients/${client.id}`, {
        method: "DELETE",
        token
      });
      setNotice(`${client.name} deleted.`);
      await loadClients();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Client delete failed");
    } finally {
      setBusy(false);
    }
  }

  if (!currentWorkspace) {
    return <EmptyState icon={UserPlus} title="Create a workspace to add clients" />;
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-semibold">Clients</h1>
            <p className="text-sm text-ledger-muted">
              Contacts, balances, and invoice history for {currentWorkspace.name}.
            </p>
          </div>
          <form
            className="flex min-w-72 flex-1 items-center gap-2 md:max-w-md"
            onSubmit={(event) => {
              event.preventDefault();
              void loadClients();
            }}
          >
            <label className="sr-only" htmlFor="client-search">
              Search clients
            </label>
            <input
              id="client-search"
              className="field"
              placeholder="Search name, email, or company"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button
              type="submit"
              className="inline-flex h-10 w-10 items-center justify-center rounded-[4px] bg-clearing text-white"
              title="Search clients"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
            </button>
          </form>
        </div>

        {error ? (
          <p className="rounded-[4px] border border-overdue/30 bg-overdue/10 p-3 text-sm text-overdue">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="rounded-[4px] border border-paid/30 bg-paid/10 p-3 text-sm text-paid">
            {notice}
          </p>
        ) : null}

        <div className="surface overflow-hidden">
          {clients.length === 0 ? (
            <EmptyState icon={UserPlus} title="No clients match this view" />
          ) : (
            <div className="overflow-x-auto">
              <table className="ledger-table min-w-[760px]">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Contact</th>
                    <th>Open amount</th>
                    <th>Last invoice</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((client) => {
                    const invoices = client.invoices ?? [];
                    const lastInvoice = [...invoices].sort(
                      (a, b) =>
                        new Date(b.dueDate).getTime() -
                        new Date(a.dueDate).getTime()
                    )[0];
                    return (
                      <tr key={client.id} className="hover:bg-white">
                        <td>
                          <Link
                            to={`/clients/${client.id}`}
                            className="font-semibold text-clearing hover:text-clearing-dark"
                          >
                            {client.name}
                          </Link>
                          <p className="text-sm text-ledger-muted">
                            {client.company || "No company"}
                          </p>
                        </td>
                        <td>
                          <p>{client.email}</p>
                          <p className="text-sm text-ledger-muted">
                            {client.phone || "No phone"}
                          </p>
                        </td>
                        <td className="font-mono font-semibold">
                          {formatMoney(openInvoiceTotal(client), currentWorkspace.currency)}
                        </td>
                        <td>
                          {lastInvoice ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <span>{formatDate(lastInvoice.dueDate)}</span>
                              <StatusBadge status={lastInvoice.status} />
                            </div>
                          ) : (
                            <span className="text-ledger-muted">No invoices</span>
                          )}
                        </td>
                        <td>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => startEdit(client)}
                              className="rounded-[4px] border border-line bg-white p-2 text-ledger-muted hover:text-clearing"
                              title="Edit client"
                            >
                              <Edit2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteClient(client)}
                              disabled={busy || invoices.length > 0}
                              className="rounded-[4px] border border-line bg-white p-2 text-ledger-muted hover:text-overdue disabled:cursor-not-allowed disabled:opacity-40"
                              title={
                                invoices.length > 0
                                  ? "Clients with invoices cannot be deleted"
                                  : "Delete client"
                              }
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <aside className="surface h-fit p-4">
        <div className="mb-4">
          <h2 className="font-display text-xl font-semibold">
            {editingClient ? "Edit client" : "Add client"}
          </h2>
          <p className="text-sm text-ledger-muted">
            Store the contact details reminders will use.
          </p>
        </div>
        <form className="space-y-3" onSubmit={submitClient}>
          <label className="label">
            Name
            <input
              className="field"
              value={form.name}
              onChange={(event) =>
                setForm((value) => ({ ...value, name: event.target.value }))
              }
              required
            />
          </label>
          <label className="label">
            Email
            <input
              type="email"
              className="field"
              value={form.email}
              onChange={(event) =>
                setForm((value) => ({ ...value, email: event.target.value }))
              }
              required
            />
          </label>
          <label className="label">
            Phone
            <input
              className="field"
              value={form.phone}
              onChange={(event) =>
                setForm((value) => ({ ...value, phone: event.target.value }))
              }
            />
          </label>
          <label className="label">
            Company
            <input
              className="field"
              value={form.company}
              onChange={(event) =>
                setForm((value) => ({ ...value, company: event.target.value }))
              }
            />
          </label>
          <label className="label">
            Notes
            <textarea
              className="field min-h-24"
              value={form.notes}
              onChange={(event) =>
                setForm((value) => ({ ...value, notes: event.target.value }))
              }
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-[4px] bg-clearing px-4 py-2 text-sm font-semibold text-white hover:bg-clearing-dark disabled:opacity-60"
            >
              {editingId ? "Save client" : "Create client"}
            </button>
            {editingId ? (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-[4px] border border-line bg-white px-4 py-2 text-sm font-semibold"
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </aside>
    </div>
  );
}
