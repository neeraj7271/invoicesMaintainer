import { useState } from "react";
import type { FormEvent } from "react";
import {
  BarChart3,
  Building2,
  ChevronDown,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Plus,
  Settings,
  Users
} from "lucide-react";
import { NavLink, Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/clients", label: "Clients", icon: Users },
  { to: "/invoices", label: "Invoices", icon: ClipboardList },
  { to: "/aging", label: "Aging", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings }
];

export function ProtectedLayout() {
  const {
    token,
    user,
    workspaces,
    currentWorkspace,
    setCurrentWorkspaceId,
    createWorkspace,
    logout
  } = useAuth();
  const [showWorkspaceForm, setShowWorkspaceForm] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [busy, setBusy] = useState(false);

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  async function submitWorkspace(event: FormEvent) {
    event.preventDefault();
    if (!workspaceName.trim()) {
      return;
    }
    setBusy(true);
    try {
      await createWorkspace(workspaceName.trim());
      setWorkspaceName("");
      setShowWorkspaceForm(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-paper text-ledger">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-line bg-night text-white lg:block">
        <div className="flex h-full flex-col">
          <div className="border-b border-white/10 px-5 py-5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-[4px] border border-white/20 bg-clearing font-display text-lg font-bold text-white">
                D
              </span>
              <div>
                <p className="font-display text-lg font-semibold">DueTracker</p>
                <p className="text-xs text-white/60">{user.name}</p>
              </div>
            </div>
          </div>

          <nav className="flex-1 space-y-1 px-3 py-4">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-[4px] px-3 py-2 text-sm font-semibold ${
                    isActive
                      ? "bg-white text-night"
                      : "text-white/70 hover:bg-white/10 hover:text-white"
                  }`
                }
              >
                <item.icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="border-t border-white/10 p-3">
            <button
              type="button"
              onClick={logout}
              className="flex w-full items-center gap-3 rounded-[4px] px-3 py-2 text-sm font-semibold text-white/70 hover:bg-white/10 hover:text-white"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-line bg-panel/95 px-4 py-3 shadow-inset-line backdrop-blur lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-clearing" aria-hidden="true" />
              <label className="sr-only" htmlFor="workspace-select">
                Workspace
              </label>
              <div className="relative">
                <select
                  id="workspace-select"
                  className="appearance-none rounded-[4px] border border-line bg-white py-2 pl-3 pr-9 text-sm font-semibold"
                  value={currentWorkspace?.id ?? ""}
                  onChange={(event) => setCurrentWorkspaceId(event.target.value)}
                >
                  {workspaces.map((workspace) => (
                    <option key={workspace.id} value={workspace.id}>
                      {workspace.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-2.5 h-4 w-4 text-ledger-muted" />
              </div>
              <button
                type="button"
                onClick={() => setShowWorkspaceForm((value) => !value)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-[4px] border border-line bg-white text-ledger-muted hover:bg-paper"
                title="Create workspace"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <nav className="flex gap-1 lg:hidden">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `rounded-[4px] p-2 ${
                      isActive
                        ? "bg-clearing text-white"
                        : "text-ledger-muted hover:bg-white"
                    }`
                  }
                  title={item.label}
                >
                  <item.icon className="h-4 w-4" aria-hidden="true" />
                </NavLink>
              ))}
            </nav>
          </div>

          {showWorkspaceForm ? (
            <form
              onSubmit={submitWorkspace}
              className="mt-3 flex max-w-xl flex-wrap items-center gap-2"
            >
              <input
                className="field min-w-64 flex-1 text-sm"
                value={workspaceName}
                onChange={(event) => setWorkspaceName(event.target.value)}
                placeholder="Workspace name"
              />
              <button
                type="submit"
                disabled={busy}
                className="rounded-[4px] bg-clearing px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                Create
              </button>
            </form>
          ) : null}
        </header>

        <main className="px-4 py-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
