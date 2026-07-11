import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiRequest, jsonBody } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { dateInputValue, formatMoney } from "../lib/format";
import type { Client, Invoice, InvoiceStatus, LineItem } from "../types";

type FormLineItem = {
  description: string;
  quantity: string;
  unitPrice: string;
};

type InvoiceFormState = {
  clientId: string;
  amount: string;
  currency: string;
  issueDate: string;
  dueDate: string;
  description: string;
  status: InvoiceStatus;
  reminderSchedule: string;
  lineItems: FormLineItem[];
};

const statusOptions: InvoiceStatus[] = [
  "UNPAID",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE"
];

function blankLine(): FormLineItem {
  return { description: "", quantity: "1", unitPrice: "" };
}

function defaultForm(currency = "USD"): InvoiceFormState {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 14);
  return {
    clientId: "",
    amount: "",
    currency,
    issueDate: dateInputValue(),
    dueDate: dateInputValue(dueDate),
    description: "",
    status: "UNPAID",
    reminderSchedule: "-3, 0, 3, 7, 14",
    lineItems: [blankLine()]
  };
}

function parseSchedule(value: string) {
  return value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isInteger(part));
}

function lineTotal(items: FormLineItem[]) {
  return items.reduce((sum, item) => {
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unitPrice);
    if (!item.description.trim() || !quantity || Number.isNaN(unitPrice)) {
      return sum;
    }
    return sum + quantity * unitPrice;
  }, 0);
}

function toFormLineItems(items?: LineItem[]) {
  if (!items || items.length === 0) {
    return [blankLine()];
  }
  return items.map((item) => ({
    description: item.description,
    quantity: String(item.quantity),
    unitPrice: String(item.unitPrice)
  }));
}

export function InvoiceFormPage({ mode }: { mode: "create" | "edit" }) {
  const { invoiceId } = useParams();
  const navigate = useNavigate();
  const { token, currentWorkspace } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [form, setForm] = useState<InvoiceFormState>(() =>
    defaultForm(currentWorkspace?.currency)
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const workspacePath = currentWorkspace
    ? `/api/workspaces/${currentWorkspace.id}`
    : "";

  const loadData = useCallback(async () => {
    if (!token || !currentWorkspace) {
      return;
    }
    const clientData = await apiRequest<Client[]>(`${workspacePath}/clients`, {
      token
    });
    setClients(clientData);

    if (mode === "edit" && invoiceId) {
      const invoiceData = await apiRequest<Invoice>(
        `${workspacePath}/invoices/${invoiceId}`,
        { token }
      );
      setInvoice(invoiceData);
      setForm({
        clientId: invoiceData.clientId,
        amount: String(invoiceData.amount),
        currency: invoiceData.currency,
        issueDate: dateInputValue(invoiceData.issueDate),
        dueDate: dateInputValue(invoiceData.dueDate),
        description: invoiceData.description ?? "",
        status: invoiceData.status,
        reminderSchedule: invoiceData.reminderSchedule.join(", "),
        lineItems: toFormLineItems(invoiceData.lineItems)
      });
    } else {
      setForm((value) => ({
        ...value,
        currency: currentWorkspace.currency,
        clientId: value.clientId || clientData[0]?.id || ""
      }));
    }
  }, [currentWorkspace, invoiceId, mode, token, workspacePath]);

  useEffect(() => {
    void loadData().catch((err) =>
      setError(err instanceof Error ? err.message : "Invoice form failed")
    );
  }, [loadData]);

  const computedLineTotal = useMemo(() => lineTotal(form.lineItems), [form.lineItems]);

  function updateLine(index: number, patch: Partial<FormLineItem>) {
    setForm((value) => ({
      ...value,
      lineItems: value.lineItems.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      )
    }));
  }

  function addLine() {
    setForm((value) => ({ ...value, lineItems: [...value.lineItems, blankLine()] }));
  }

  function removeLine(index: number) {
    setForm((value) => ({
      ...value,
      lineItems:
        value.lineItems.length === 1
          ? [blankLine()]
          : value.lineItems.filter((_, itemIndex) => itemIndex !== index)
    }));
  }

  async function submitInvoice(event: FormEvent) {
    event.preventDefault();
    if (!token || !currentWorkspace) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const lineItems = form.lineItems
        .filter((item) => item.description.trim())
        .map((item) => ({
          description: item.description.trim(),
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice)
        }))
        .filter((item) => item.quantity > 0 && item.unitPrice >= 0);

      const payload = {
        clientId: form.clientId,
        amount: lineItems.length > 0 ? undefined : Number(form.amount),
        currency: form.currency,
        issueDate: form.issueDate,
        dueDate: form.dueDate,
        description: form.description || null,
        status: form.status,
        reminderSchedule: parseSchedule(form.reminderSchedule),
        lineItems
      };

      const saved = await apiRequest<Invoice>(
        mode === "edit" && invoiceId
          ? `${workspacePath}/invoices/${invoiceId}`
          : `${workspacePath}/invoices`,
        {
          method: mode === "edit" ? "PUT" : "POST",
          token,
          body: jsonBody(payload)
        }
      );
      navigate(`/invoices/${saved.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invoice save failed");
    } finally {
      setBusy(false);
    }
  }

  if (!currentWorkspace) {
    return <div className="text-sm text-ledger-muted">Select a workspace.</div>;
  }

  return (
    <div className="space-y-6">
      <Link
        to={mode === "edit" && invoiceId ? `/invoices/${invoiceId}` : "/invoices"}
        className="inline-flex items-center gap-2 text-sm font-semibold text-clearing"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {mode === "edit" ? "Invoice detail" : "Invoices"}
      </Link>

      <form className="grid gap-6 xl:grid-cols-[1fr_340px]" onSubmit={submitInvoice}>
        <section className="surface space-y-5 p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-ledger-muted">
              {mode === "edit" ? invoice?.invoiceNumber : "Auto-generated number"}
            </p>
            <h1 className="font-display text-3xl font-semibold">
              {mode === "edit" ? "Edit invoice" : "Create invoice"}
            </h1>
          </div>

          {error ? (
            <p className="rounded-[4px] border border-overdue/30 bg-overdue/10 p-3 text-sm text-overdue">
              {error}
            </p>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <label className="label">
              Client
              <select
                className="field"
                value={form.clientId}
                onChange={(event) =>
                  setForm((value) => ({ ...value, clientId: event.target.value }))
                }
                required
              >
                <option value="" disabled>
                  Select client
                </option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="label">
              Currency
              <input
                className="field uppercase"
                value={form.currency}
                maxLength={3}
                onChange={(event) =>
                  setForm((value) => ({
                    ...value,
                    currency: event.target.value.toUpperCase()
                  }))
                }
                required
              />
            </label>
            <label className="label">
              Issue date
              <input
                type="date"
                className="field"
                value={form.issueDate}
                onChange={(event) =>
                  setForm((value) => ({ ...value, issueDate: event.target.value }))
                }
                required
              />
            </label>
            <label className="label">
              Due date
              <input
                type="date"
                className="field"
                value={form.dueDate}
                onChange={(event) =>
                  setForm((value) => ({ ...value, dueDate: event.target.value }))
                }
                required
              />
            </label>
            <label className="label">
              Status
              <select
                className="field"
                value={form.status}
                onChange={(event) =>
                  setForm((value) => ({
                    ...value,
                    status: event.target.value as InvoiceStatus
                  }))
                }
              >
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status.replace("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label className="label">
              Fallback amount
              <input
                type="number"
                min="0"
                step="0.01"
                className="field"
                value={form.amount}
                onChange={(event) =>
                  setForm((value) => ({ ...value, amount: event.target.value }))
                }
                placeholder="Used if no line items are entered"
              />
            </label>
          </div>

          <label className="label">
            Description
            <textarea
              className="field min-h-24"
              value={form.description}
              onChange={(event) =>
                setForm((value) => ({ ...value, description: event.target.value }))
              }
            />
          </label>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-xl font-semibold">Line items</h2>
              <button
                type="button"
                onClick={addLine}
                className="inline-flex items-center gap-2 rounded-[4px] border border-line bg-white px-3 py-2 text-sm font-semibold"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add line
              </button>
            </div>
            <div className="space-y-3">
              {form.lineItems.map((item, index) => (
                <div
                  key={`${index}-${item.description}`}
                  className="grid gap-3 md:grid-cols-[1fr_110px_140px_40px]"
                >
                  <input
                    className="field"
                    value={item.description}
                    onChange={(event) =>
                      updateLine(index, { description: event.target.value })
                    }
                    placeholder="Description"
                  />
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    className="field"
                    value={item.quantity}
                    onChange={(event) =>
                      updateLine(index, { quantity: event.target.value })
                    }
                    placeholder="Qty"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="field"
                    value={item.unitPrice}
                    onChange={(event) =>
                      updateLine(index, { unitPrice: event.target.value })
                    }
                    placeholder="Unit price"
                  />
                  <button
                    type="button"
                    onClick={() => removeLine(index)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-[4px] border border-line bg-white text-ledger-muted hover:text-overdue"
                    title="Remove line"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="surface h-fit space-y-5 p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-ledger-muted">
              Invoice total
            </p>
            <p className="mt-2 font-mono text-3xl font-semibold">
              {formatMoney(
                computedLineTotal || Number(form.amount || 0),
                form.currency || currentWorkspace.currency
              )}
            </p>
          </div>
          <label className="label">
            Reminder schedule
            <input
              className="field font-mono"
              value={form.reminderSchedule}
              onChange={(event) =>
                setForm((value) => ({
                  ...value,
                  reminderSchedule: event.target.value
                }))
              }
            />
            <span className="text-xs font-normal text-ledger-muted">
              Days relative to due date. Negative values send before due date.
            </span>
          </label>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-[4px] bg-clearing px-4 py-2.5 text-sm font-semibold text-white hover:bg-clearing-dark disabled:opacity-60"
          >
            {busy ? "Saving..." : mode === "edit" ? "Save invoice" : "Create invoice"}
          </button>
        </aside>
      </form>
    </div>
  );
}
