import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
  ArrowLeft,
  Edit2,
  FileUp,
  MailCheck,
  Receipt,
  Trash2
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { StatusBadge } from "../components/StatusBadge";
import { apiRequest, jsonBody } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { dateInputValue, formatDate, formatMoney } from "../lib/format";
import type { Invoice } from "../types";

export function InvoiceDetailPage() {
  const { invoiceId } = useParams();
  const navigate = useNavigate();
  const { token, currentWorkspace } = useAuth();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    paidAt: dateInputValue(),
    note: ""
  });
  const [offsetDays, setOffsetDays] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const workspacePath = currentWorkspace
    ? `/api/workspaces/${currentWorkspace.id}`
    : "";

  const loadInvoice = useCallback(async () => {
    if (!token || !currentWorkspace || !invoiceId) {
      return;
    }
    const data = await apiRequest<Invoice>(
      `${workspacePath}/invoices/${invoiceId}`,
      { token }
    );
    setInvoice(data);
    setPaymentForm((value) => ({
      ...value,
      amount: value.amount || String(data.outstandingAmount || data.amount)
    }));
  }, [currentWorkspace, invoiceId, token, workspacePath]);

  useEffect(() => {
    void loadInvoice().catch((err) =>
      setError(err instanceof Error ? err.message : "Invoice failed")
    );
  }, [loadInvoice]);

  const daysFromDue = useMemo(() => {
    if (!invoice) {
      return 0;
    }
    const due = new Date(invoice.dueDate);
    const today = new Date();
    due.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    return Math.round((today.getTime() - due.getTime()) / 86400000);
  }, [invoice]);

  async function recordPayment(event: FormEvent) {
    event.preventDefault();
    if (!token || !invoice || !currentWorkspace) {
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiRequest(`${workspacePath}/invoices/${invoice.id}/payments`, {
        method: "POST",
        token,
        body: jsonBody({
          amount: Number(paymentForm.amount),
          paidAt: paymentForm.paidAt,
          note: paymentForm.note || null
        })
      });
      setNotice("Payment recorded.");
      setPaymentForm({ amount: "", paidAt: dateInputValue(), note: "" });
      await loadInvoice();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setBusy(false);
    }
  }

  async function uploadAttachment(event: FormEvent) {
    event.preventDefault();
    if (!token || !invoice || !file) {
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const formData = new FormData();
      formData.append("attachment", file);
      await apiRequest(`${workspacePath}/invoices/${invoice.id}/attachment`, {
        method: "POST",
        token,
        body: formData
      });
      setNotice("Attachment uploaded.");
      setFile(null);
      await loadInvoice();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Attachment failed");
    } finally {
      setBusy(false);
    }
  }

  async function sendReminder(event: FormEvent) {
    event.preventDefault();
    if (!token || !invoice) {
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiRequest(`${workspacePath}/invoices/${invoice.id}/reminders/send`, {
        method: "POST",
        token,
        body: jsonBody({
          offsetDays: offsetDays ? Number(offsetDays) : undefined
        })
      });
      setNotice("Reminder attempt logged.");
      await loadInvoice();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reminder failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteInvoice() {
    if (!token || !invoice) {
      return;
    }
    const confirmed = window.confirm(`Delete ${invoice.invoiceNumber}?`);
    if (!confirmed) {
      return;
    }
    setBusy(true);
    try {
      await apiRequest(`${workspacePath}/invoices/${invoice.id}`, {
        method: "DELETE",
        token
      });
      navigate("/invoices");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
  }

  if (error) {
    return (
      <div className="rounded-[4px] border border-overdue/30 bg-overdue/10 p-4 text-overdue">
        {error}
      </div>
    );
  }

  if (!invoice || !currentWorkspace) {
    return <div className="text-sm text-ledger-muted">Loading invoice...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/invoices"
          className="inline-flex items-center gap-2 text-sm font-semibold text-clearing"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Invoices
        </Link>
        <div className="flex gap-2">
          <Link
            to={`/invoices/${invoice.id}/edit`}
            className="inline-flex items-center gap-2 rounded-[4px] border border-line bg-white px-3 py-2 text-sm font-semibold"
          >
            <Edit2 className="h-4 w-4" aria-hidden="true" />
            Edit
          </Link>
          <button
            type="button"
            onClick={() => void deleteInvoice()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-[4px] border border-overdue/30 bg-overdue/10 px-3 py-2 text-sm font-semibold text-overdue disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Delete
          </button>
        </div>
      </div>

      <section className="surface grid overflow-hidden lg:grid-cols-[1fr_360px]">
        <div className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-sm font-semibold text-ledger-muted">
                {invoice.invoiceNumber}
              </p>
              <h1 className="mt-1 font-display text-3xl font-semibold">
                {invoice.client?.name}
              </h1>
              <p className="mt-2 max-w-2xl text-ledger-muted">
                {invoice.description || "No description"}
              </p>
            </div>
            <StatusBadge status={invoice.status} />
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.06em] text-ledger-muted">
                Issue date
              </p>
              <p className="mt-1 font-semibold">{formatDate(invoice.issueDate)}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.06em] text-ledger-muted">
                Due date
              </p>
              <p className="mt-1 font-semibold">{formatDate(invoice.dueDate)}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.06em] text-ledger-muted">
                Reminder schedule
              </p>
              <p className="mt-1 font-mono text-sm">
                {invoice.reminderSchedule.join(", ") || "workspace default"}
              </p>
            </div>
          </div>
        </div>
        <div className="border-t border-line bg-night p-5 text-white lg:border-l lg:border-t-0">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-white/60">
            Open balance
          </p>
          <p className="mt-3 font-mono text-4xl font-semibold">
            {formatMoney(invoice.outstandingAmount, invoice.currency)}
          </p>
          <p className="mt-2 text-sm text-white/60">
            {daysFromDue > 0
              ? `${daysFromDue} day(s) past due`
              : `${Math.abs(daysFromDue)} day(s) until due`}
          </p>
        </div>
      </section>

      {notice ? (
        <p className="rounded-[4px] border border-paid/30 bg-paid/10 p-3 text-sm text-paid">
          {notice}
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <section className="surface overflow-hidden">
          <div className="border-b border-line px-4 py-3">
            <h2 className="font-display text-xl font-semibold">Line items</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="ledger-table min-w-[680px]">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Qty</th>
                  <th>Unit</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {(invoice.lineItems ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-ledger-muted">
                      No line items saved.
                    </td>
                  </tr>
                ) : (
                  invoice.lineItems?.map((item) => (
                    <tr key={item.id ?? item.description}>
                      <td>{item.description}</td>
                      <td className="font-mono">{item.quantity}</td>
                      <td className="font-mono">
                        {formatMoney(item.unitPrice, invoice.currency)}
                      </td>
                      <td className="font-mono font-semibold">
                        {formatMoney(item.amount ?? 0, invoice.currency)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="space-y-6">
          <form className="surface space-y-3 p-4" onSubmit={recordPayment}>
            <h2 className="font-display text-xl font-semibold">Record payment</h2>
            <label className="label">
              Amount
              <input
                type="number"
                min="0.01"
                step="0.01"
                className="field"
                value={paymentForm.amount}
                onChange={(event) =>
                  setPaymentForm((value) => ({
                    ...value,
                    amount: event.target.value
                  }))
                }
                required
              />
            </label>
            <label className="label">
              Paid date
              <input
                type="date"
                className="field"
                value={paymentForm.paidAt}
                onChange={(event) =>
                  setPaymentForm((value) => ({
                    ...value,
                    paidAt: event.target.value
                  }))
                }
                required
              />
            </label>
            <label className="label">
              Note
              <input
                className="field"
                value={paymentForm.note}
                onChange={(event) =>
                  setPaymentForm((value) => ({ ...value, note: event.target.value }))
                }
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-[4px] bg-clearing px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              <Receipt className="h-4 w-4" aria-hidden="true" />
              Save payment
            </button>
          </form>

          <form className="surface space-y-3 p-4" onSubmit={sendReminder}>
            <h2 className="font-display text-xl font-semibold">Send reminder</h2>
            <label className="label">
              Offset day
              <input
                className="field font-mono"
                value={offsetDays}
                onChange={(event) => setOffsetDays(event.target.value)}
                placeholder={String(daysFromDue)}
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-[4px] bg-night px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              <MailCheck className="h-4 w-4" aria-hidden="true" />
              Send email
            </button>
          </form>

          <form className="surface space-y-3 p-4" onSubmit={uploadAttachment}>
            <h2 className="font-display text-xl font-semibold">Attachment</h2>
            <input className="field" type="file" onChange={onFileChange} />
            <button
              type="submit"
              disabled={busy || !file}
              className="inline-flex items-center gap-2 rounded-[4px] border border-line bg-white px-4 py-2 text-sm font-semibold disabled:opacity-60"
            >
              <FileUp className="h-4 w-4" aria-hidden="true" />
              Upload file
            </button>
          </form>
        </aside>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="surface overflow-hidden">
          <div className="border-b border-line px-4 py-3">
            <h2 className="font-display text-xl font-semibold">Payments</h2>
          </div>
          <div className="divide-y divide-line/70">
            {(invoice.payments ?? []).length === 0 ? (
              <p className="p-4 text-sm text-ledger-muted">No payments recorded.</p>
            ) : (
              invoice.payments?.map((payment) => (
                <div key={payment.id} className="flex justify-between gap-3 p-4">
                  <div>
                    <p className="font-semibold">{formatDate(payment.paidAt)}</p>
                    <p className="text-sm text-ledger-muted">
                      {payment.note || "Payment"}
                    </p>
                  </div>
                  <p className="font-mono font-semibold">
                    {formatMoney(payment.amount, invoice.currency)}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="surface overflow-hidden">
          <div className="border-b border-line px-4 py-3">
            <h2 className="font-display text-xl font-semibold">Reminder log</h2>
          </div>
          <div className="divide-y divide-line/70">
            {(invoice.reminderLogs ?? []).length === 0 ? (
              <p className="p-4 text-sm text-ledger-muted">No reminders logged.</p>
            ) : (
              invoice.reminderLogs?.map((log) => (
                <div key={log.id} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{log.subject}</p>
                    <StatusBadge status={log.status} />
                  </div>
                  <p className="mt-1 text-sm text-ledger-muted">
                    {log.recipient} - offset {log.scheduledOffsetDays} -{" "}
                    {formatDate(log.sentAt)}
                  </p>
                  {log.providerMessage ? (
                    <p className="mt-1 text-xs text-ledger-muted">
                      {log.providerMessage}
                    </p>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="surface overflow-hidden">
        <div className="border-b border-line px-4 py-3">
          <h2 className="font-display text-xl font-semibold">Files</h2>
        </div>
        <div className="divide-y divide-line/70">
          {(invoice.attachments ?? []).length === 0 ? (
            <p className="p-4 text-sm text-ledger-muted">No attachments uploaded.</p>
          ) : (
            invoice.attachments?.map((attachment) => (
              <a
                key={attachment.id}
                className="block p-4 font-semibold text-clearing"
                href={`/${attachment.path}`}
                target="_blank"
                rel="noreferrer"
              >
                {attachment.originalName}
              </a>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
