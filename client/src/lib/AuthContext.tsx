import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import type { ReactNode } from "react";
import { apiRequest, jsonBody, type AuthResponse } from "./api";
import type { User, Workspace } from "../types";

type AuthState = {
  token: string | null;
  user: User | null;
  workspaces: Workspace[];
  currentWorkspaceId: string | null;
};

type AuthContextValue = AuthState & {
  currentWorkspace: Workspace | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (input: {
    name: string;
    email: string;
    password: string;
    businessName: string;
  }) => Promise<void>;
  logout: () => void;
  refreshWorkspaces: () => Promise<void>;
  setCurrentWorkspaceId: (workspaceId: string) => void;
  createWorkspace: (name: string) => Promise<Workspace>;
};

const storageKey = "duetracker.auth";
const workspaceKey = "duetracker.workspace";

const AuthContext = createContext<AuthContextValue | null>(null);

function loadState(): AuthState {
  const stored = localStorage.getItem(storageKey);
  if (!stored) {
    return {
      token: null,
      user: null,
      workspaces: [],
      currentWorkspaceId: localStorage.getItem(workspaceKey)
    };
  }

  try {
    const parsed = JSON.parse(stored) as Pick<
      AuthState,
      "token" | "user" | "workspaces"
    >;
    return {
      token: parsed.token,
      user: parsed.user,
      workspaces: parsed.workspaces ?? [],
      currentWorkspaceId:
        localStorage.getItem(workspaceKey) ?? parsed.workspaces?.[0]?.id ?? null
    };
  } catch {
    localStorage.removeItem(storageKey);
    return { token: null, user: null, workspaces: [], currentWorkspaceId: null };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => loadState());

  const persist = useCallback((next: AuthState) => {
    setState(next);
    if (next.token && next.user) {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          token: next.token,
          user: next.user,
          workspaces: next.workspaces
        })
      );
    } else {
      localStorage.removeItem(storageKey);
    }
    if (next.currentWorkspaceId) {
      localStorage.setItem(workspaceKey, next.currentWorkspaceId);
    }
  }, []);

  const applyAuth = useCallback(
    (payload: AuthResponse) => {
      const currentWorkspaceId =
        localStorage.getItem(workspaceKey) ?? payload.workspaces[0]?.id ?? null;
      persist({
        token: payload.token,
        user: payload.user,
        workspaces: payload.workspaces,
        currentWorkspaceId
      });
    },
    [persist]
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const payload = await apiRequest<AuthResponse>("/api/auth/login", {
        method: "POST",
        body: jsonBody({ email, password })
      });
      applyAuth(payload);
    },
    [applyAuth]
  );

  const signup = useCallback(
    async (input: {
      name: string;
      email: string;
      password: string;
      businessName: string;
    }) => {
      const payload = await apiRequest<AuthResponse>("/api/auth/signup", {
        method: "POST",
        body: jsonBody(input)
      });
      applyAuth(payload);
    },
    [applyAuth]
  );

  const logout = useCallback(() => {
    persist({ token: null, user: null, workspaces: [], currentWorkspaceId: null });
    localStorage.removeItem(workspaceKey);
  }, [persist]);

  const refreshWorkspaces = useCallback(async () => {
    if (!state.token) {
      return;
    }
    const workspaces = await apiRequest<Workspace[]>("/api/workspaces", {
      token: state.token
    });
    persist({
      ...state,
      workspaces,
      currentWorkspaceId:
        state.currentWorkspaceId ?? workspaces[0]?.id ?? null
    });
  }, [persist, state]);

  const setCurrentWorkspaceId = useCallback(
    (workspaceId: string) => {
      persist({ ...state, currentWorkspaceId: workspaceId });
    },
    [persist, state]
  );

  const createWorkspace = useCallback(
    async (name: string) => {
      if (!state.token) {
        throw new Error("Not authenticated");
      }
      const workspace = await apiRequest<Workspace>("/api/workspaces", {
        method: "POST",
        token: state.token,
        body: jsonBody({ name, currency: "USD" })
      });
      persist({
        ...state,
        workspaces: [...state.workspaces, workspace],
        currentWorkspaceId: workspace.id
      });
      return workspace;
    },
    [persist, state]
  );

  useEffect(() => {
    if (state.token && state.workspaces.length === 0) {
      void refreshWorkspaces().catch(logout);
    }
  }, [logout, refreshWorkspaces, state.token, state.workspaces.length]);

  const currentWorkspace = useMemo(
    () =>
      state.workspaces.find(
        (workspace) => workspace.id === state.currentWorkspaceId
      ) ?? state.workspaces[0] ?? null,
    [state.currentWorkspaceId, state.workspaces]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      currentWorkspace,
      login,
      signup,
      logout,
      refreshWorkspaces,
      setCurrentWorkspaceId,
      createWorkspace
    }),
    [
      state,
      currentWorkspace,
      login,
      signup,
      logout,
      refreshWorkspaces,
      setCurrentWorkspaceId,
      createWorkspace
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return value;
}
