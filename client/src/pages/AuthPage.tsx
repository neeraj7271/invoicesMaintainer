import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { KeyRound, Mail, UserPlus } from "lucide-react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { apiRequest, jsonBody } from "../lib/api";
import { useAuth } from "../lib/AuthContext";

type Mode = "login" | "signup" | "reset-request" | "reset-confirm";

function modeFromPath(pathname: string): Mode {
  if (pathname === "/signup") {
    return "signup";
  }
  if (pathname === "/forgot-password") {
    return "reset-request";
  }
  if (pathname === "/password-reset") {
    return "reset-confirm";
  }
  return "login";
}

const sampleRows = [
  ["Northstar Labs", "INV-2026-0001", "$2,400", "8d late"],
  ["Bell Construction", "INV-2026-0002", "$3,700", "due Fri"],
  ["Nair Studio", "INV-2026-0003", "$1,800", "scheduled"]
];

export function AuthPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { token, login, signup } = useAuth();
  const mode = useMemo(() => modeFromPath(location.pathname), [location.pathname]);
  const searchParams = new URLSearchParams(location.search);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    businessName: "",
    token: searchParams.get("token") ?? ""
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  if (token) {
    return <Navigate to="/" replace />;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      if (mode === "login") {
        await login(form.email, form.password);
        navigate("/");
      } else if (mode === "signup") {
        await signup({
          name: form.name,
          email: form.email,
          password: form.password,
          businessName: form.businessName || `${form.name}'s Workspace`
        });
        navigate("/");
      } else if (mode === "reset-request") {
        const response = await apiRequest<{ ok: true; resetToken?: string }>(
          "/api/auth/password-reset/request",
          {
            method: "POST",
            body: jsonBody({ email: form.email })
          }
        );
        setNotice(
          response.resetToken
            ? `Reset link created. Development token: ${response.resetToken}`
            : "Reset instructions sent if the account exists."
        );
      } else {
        const response = await apiRequest<{
          token: string;
          user: unknown;
          workspaces: unknown[];
        }>("/api/auth/password-reset/confirm", {
          method: "POST",
          body: jsonBody({ token: form.token, password: form.password })
        });
        localStorage.setItem("duetracker.auth", JSON.stringify(response));
        window.location.href = "/";
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  const title = {
    login: "Sign in",
    signup: "Create account",
    "reset-request": "Reset password",
    "reset-confirm": "Set new password"
  }[mode];

  const Icon = mode === "signup" ? UserPlus : mode.startsWith("reset") ? KeyRound : Mail;

  return (
    <main className="min-h-screen bg-paper px-4 py-10 text-ledger">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl items-center gap-8 lg:grid-cols-[1fr_430px]">
        <section className="hidden lg:block">
          <div className="max-w-2xl">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-[4px] bg-night font-display text-xl font-bold text-white">
                D
              </span>
              <div>
                <h1 className="font-display text-4xl font-semibold tracking-normal">
                  DueTracker
                </h1>
                <p className="text-ledger-muted">Receivables follow-up workspace</p>
              </div>
            </div>

            <div className="surface mt-10 overflow-hidden bg-panel">
              <div className="grid grid-cols-[1fr_auto] border-b border-line bg-night p-5 text-white">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.08em] text-white/60">
                    Collection pressure
                  </p>
                  <p className="mt-2 font-mono text-4xl font-semibold">$12,480</p>
                </div>
                <div className="border-l border-white/15 pl-6 text-right">
                  <p className="text-xs uppercase tracking-[0.08em] text-white/60">
                    Oldest
                  </p>
                  <p className="mt-2 font-mono text-3xl font-semibold">42d</p>
                </div>
              </div>
              <div className="p-5">
                <div className="h-3 overflow-hidden rounded-[3px] bg-line">
                  <div className="h-full w-[68%] bg-overdue" />
                </div>
                <div className="mt-5 overflow-hidden border border-line">
                  <table className="ledger-table text-sm">
                    <tbody>
                      {sampleRows.map((row) => (
                        <tr key={row[1]}>
                          <td className="font-semibold">{row[0]}</td>
                          <td className="font-mono text-ledger-muted">{row[1]}</td>
                          <td className="font-mono font-semibold">{row[2]}</td>
                          <td className="text-right text-ledger-muted">{row[3]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="surface bg-panel p-6 shadow-ledger">
          <div className="mb-6 flex items-center gap-3">
            <Icon className="h-5 w-5 text-clearing" aria-hidden="true" />
            <h2 className="font-display text-2xl font-semibold">{title}</h2>
          </div>

          <form className="space-y-4" onSubmit={submit}>
            {mode === "signup" ? (
              <>
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
                  Workspace
                  <input
                    className="field"
                    value={form.businessName}
                    onChange={(event) =>
                      setForm((value) => ({
                        ...value,
                        businessName: event.target.value
                      }))
                    }
                    required
                  />
                </label>
              </>
            ) : null}

            {mode !== "reset-confirm" ? (
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
            ) : (
              <label className="label">
                Reset token
                <input
                  className="field"
                  value={form.token}
                  onChange={(event) =>
                    setForm((value) => ({ ...value, token: event.target.value }))
                  }
                  required
                />
              </label>
            )}

            {mode !== "reset-request" ? (
              <label className="label">
                Password
                <input
                  type="password"
                  className="field"
                  value={form.password}
                  onChange={(event) =>
                    setForm((value) => ({
                      ...value,
                      password: event.target.value
                    }))
                  }
                  minLength={8}
                  required
                />
              </label>
            ) : null}

            {error ? (
              <p className="rounded-[4px] border border-overdue/30 bg-overdue/10 px-3 py-2 text-sm text-overdue">
                {error}
              </p>
            ) : null}
            {notice ? (
              <p className="rounded-[4px] border border-paid/30 bg-paid/10 px-3 py-2 text-sm text-paid">
                {notice}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-[4px] bg-clearing px-4 py-2.5 text-sm font-semibold text-white hover:bg-clearing-dark disabled:opacity-60"
            >
              {busy ? "Working..." : title}
            </button>
          </form>

          <div className="mt-5 flex flex-wrap justify-between gap-2 text-sm">
            {mode !== "login" ? (
              <Link className="font-semibold text-clearing" to="/login">
                Sign in
              </Link>
            ) : (
              <Link className="font-semibold text-clearing" to="/signup">
                Create account
              </Link>
            )}
            {mode !== "reset-request" ? (
              <Link className="font-semibold text-ledger-muted" to="/forgot-password">
                Reset password
              </Link>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
