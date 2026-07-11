import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Save } from "lucide-react";
import { apiRequest, jsonBody } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { textareaTemplateHint } from "../lib/format";
import type { SettingsData } from "../types";

function parseSchedule(value: string) {
  return value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isInteger(part));
}

export function SettingsPage() {
  const { token, currentWorkspace, refreshWorkspaces } = useAuth();
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [form, setForm] = useState({
    name: "",
    legalName: "",
    currency: "USD",
    defaultReminderSchedule: "-3, 0, 3, 7, 14",
    senderName: "",
    senderEmail: "",
    timezone: "UTC",
    templateId: "",
    templateName: "",
    subject: "",
    body: ""
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const loadSettings = useCallback(async () => {
    if (!token || !currentWorkspace) {
      return;
    }
    const data = await apiRequest<SettingsData>(
      `/api/workspaces/${currentWorkspace.id}/settings`,
      { token }
    );
    setSettings(data);
    setForm({
      name: data.workspace.name,
      legalName: data.workspace.legalName ?? "",
      currency: data.workspace.currency,
      defaultReminderSchedule: data.workspace.defaultReminderSchedule.join(", "),
      senderName: data.workspace.senderName ?? "",
      senderEmail: data.workspace.senderEmail ?? "",
      timezone: data.workspace.timezone,
      templateId: data.template.id,
      templateName: data.template.name,
      subject: data.template.subject,
      body: data.template.body
    });
  }, [currentWorkspace, token]);

  useEffect(() => {
    void loadSettings().catch((err) =>
      setError(err instanceof Error ? err.message : "Settings failed")
    );
  }, [loadSettings]);

  async function submitSettings(event: FormEvent) {
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
        legalName: form.legalName || null,
        currency: form.currency,
        defaultReminderSchedule: parseSchedule(form.defaultReminderSchedule),
        senderName: form.senderName || null,
        senderEmail: form.senderEmail || null,
        timezone: form.timezone,
        template: {
          id: form.templateId,
          name: form.templateName,
          subject: form.subject,
          body: form.body
        }
      };
      const data = await apiRequest<SettingsData>(
        `/api/workspaces/${currentWorkspace.id}/settings`,
        {
          method: "PUT",
          token,
          body: jsonBody(payload)
        }
      );
      setSettings(data);
      await refreshWorkspaces();
      setNotice("Settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Settings save failed");
    } finally {
      setBusy(false);
    }
  }

  if (!currentWorkspace) {
    return <div className="text-sm text-ledger-muted">Select a workspace.</div>;
  }

  if (!settings) {
    return <div className="text-sm text-ledger-muted">Loading settings...</div>;
  }

  return (
    <form className="grid gap-6 xl:grid-cols-[1fr_420px]" onSubmit={submitSettings}>
      <section className="surface space-y-5 p-5">
        <div>
          <h1 className="font-display text-3xl font-semibold">Settings</h1>
          <p className="text-sm text-ledger-muted">
            Business profile, reminder defaults, and sender identity.
          </p>
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

        <div className="grid gap-4 md:grid-cols-2">
          <label className="label">
            Workspace name
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
            Legal name
            <input
              className="field"
              value={form.legalName}
              onChange={(event) =>
                setForm((value) => ({ ...value, legalName: event.target.value }))
              }
            />
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
            Timezone
            <input
              className="field"
              value={form.timezone}
              onChange={(event) =>
                setForm((value) => ({ ...value, timezone: event.target.value }))
              }
              required
            />
          </label>
          <label className="label">
            Sender name
            <input
              className="field"
              value={form.senderName}
              onChange={(event) =>
                setForm((value) => ({ ...value, senderName: event.target.value }))
              }
            />
          </label>
          <label className="label">
            Sender email
            <input
              type="email"
              className="field"
              value={form.senderEmail}
              onChange={(event) =>
                setForm((value) => ({ ...value, senderEmail: event.target.value }))
              }
            />
          </label>
        </div>

        <label className="label">
          Default reminder schedule
          <input
            className="field font-mono"
            value={form.defaultReminderSchedule}
            onChange={(event) =>
              setForm((value) => ({
                ...value,
                defaultReminderSchedule: event.target.value
              }))
            }
          />
          <span className="text-xs font-normal text-ledger-muted">
            Comma-separated day offsets: -3, 0, 3, 7, 14.
          </span>
        </label>
      </section>

      <aside className="surface h-fit space-y-4 p-5">
        <div>
          <h2 className="font-display text-2xl font-semibold">Email template</h2>
          <p className="text-sm text-ledger-muted">
            Variables: {textareaTemplateHint()}
          </p>
        </div>
        <label className="label">
          Template name
          <input
            className="field"
            value={form.templateName}
            onChange={(event) =>
              setForm((value) => ({ ...value, templateName: event.target.value }))
            }
            required
          />
        </label>
        <label className="label">
          Subject
          <input
            className="field"
            value={form.subject}
            onChange={(event) =>
              setForm((value) => ({ ...value, subject: event.target.value }))
            }
            required
          />
        </label>
        <label className="label">
          Body
          <textarea
            className="field min-h-64"
            value={form.body}
            onChange={(event) =>
              setForm((value) => ({ ...value, body: event.target.value }))
            }
            required
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-[4px] bg-clearing px-4 py-2.5 text-sm font-semibold text-white hover:bg-clearing-dark disabled:opacity-60"
        >
          <Save className="h-4 w-4" aria-hidden="true" />
          {busy ? "Saving..." : "Save settings"}
        </button>
      </aside>
    </form>
  );
}
