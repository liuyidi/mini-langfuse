// Auth context for managing user authentication state (M6)
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { setActiveProjectId, clearActiveProjectId } from "./projectAuth";

export type User = {
  id: string;
  email: string;
  name: string | null;
};

export type Organization = {
  id: string;
  name: string;
  role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
};

export type Project = {
  id: string;
  name: string;
  org_id: string | null;
};

export type MeResponse = {
  user: User;
  organizations: Organization[];
  projects: Project[];
};

export type BrowserSession = {
  token: string;
  created_at: string;
  expires_at: string;
  is_current: boolean;
};

type AuthContextType = {
  user: User | null;
  organizations: Organization[];
  projects: Project[];
  currentProject: Project | null;
  setCurrentProject: (project: Project) => void;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  updateProfile: (body: { name?: string | null; email?: string | null; currentPassword?: string }) => Promise<void>;
  changePassword: (body: { currentPassword: string; newPassword: string }) => Promise<void>;
  deleteAccount: (body: { currentPassword: string }) => Promise<void>;
  listSessions: () => Promise<BrowserSession[]>;
  revokeSession: (token: string) => Promise<{ ok: boolean; revoked_current?: boolean }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProjectState] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load current user from cookie session
  const refresh = async () => {
    try {
      const res = await fetch("/api/ui/me", { credentials: "include" });
      if (res.ok) {
        const data: MeResponse = await res.json();
        setUser(data.user);
        setOrganizations(data.organizations);
        setProjects(data.projects);
        // Restore last selected project or use first
        const savedProjectId = localStorage.getItem("currentProjectId");
        const saved = data.projects.find((p) => p.id === savedProjectId);
        const nextProject = saved || data.projects[0] || null;
        setCurrentProjectState(nextProject);
        if (nextProject) {
          localStorage.setItem("currentProjectId", nextProject.id);
          setActiveProjectId(nextProject.id);
        } else {
          localStorage.removeItem("currentProjectId");
          clearActiveProjectId();
        }
      } else {
        setUser(null);
        setOrganizations([]);
        setProjects([]);
        setCurrentProjectState(null);
        clearActiveProjectId();
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const setCurrentProject = (project: Project) => {
    setCurrentProjectState(project);
    localStorage.setItem("currentProjectId", project.id);
    setActiveProjectId(project.id);
  };

  const login = async (email: string, password: string) => {
    const res = await fetch("/api/ui/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Login failed" }));
      throw new Error(err.detail || "Login failed");
    }
    await refresh();
  };

  const register = async (email: string, password: string, name?: string) => {
    const res = await fetch("/api/ui/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password, name }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Registration failed" }));
      throw new Error(err.detail || "Registration failed");
    }
    await refresh();
  };

  const updateProfile = async (body: { name?: string | null; email?: string | null; currentPassword?: string }) => {
    const res = await fetch("/api/ui/account/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name: body.name,
        email: body.email,
        current_password: body.currentPassword,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Profile update failed" }));
      throw new Error(err.detail || "Profile update failed");
    }
    await refresh();
  };

  const changePassword = async (body: { currentPassword: string; newPassword: string }) => {
    const res = await fetch("/api/ui/account/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        current_password: body.currentPassword,
        new_password: body.newPassword,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Password update failed" }));
      throw new Error(err.detail || "Password update failed");
    }
  };

  const deleteAccount = async (body: { currentPassword: string }) => {
    const res = await fetch("/api/ui/account/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        current_password: body.currentPassword,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to delete account" }));
      throw new Error(err.detail || "Failed to delete account");
    }
    setUser(null);
    setOrganizations([]);
    setProjects([]);
    setCurrentProjectState(null);
    localStorage.removeItem("currentProjectId");
    clearActiveProjectId();
  };

  const listSessions = async () => {
    const res = await fetch("/api/ui/account/sessions", {
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to load sessions" }));
      throw new Error(err.detail || "Failed to load sessions");
    }
    return (await res.json()) as BrowserSession[];
  };

  const revokeSession = async (token: string) => {
    const res = await fetch(`/api/ui/account/sessions/${encodeURIComponent(token)}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to revoke session" }));
      throw new Error(err.detail || "Failed to revoke session");
    }
    return res.json();
  };

  const logout = async () => {
    await fetch("/api/ui/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    setUser(null);
    setOrganizations([]);
    setProjects([]);
    setCurrentProjectState(null);
    localStorage.removeItem("currentProjectId");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        organizations,
        projects,
        currentProject,
        setCurrentProject,
        isLoading,
        login,
        register,
        updateProfile,
        changePassword,
        deleteAccount,
        listSessions,
        revokeSession,
        logout,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
