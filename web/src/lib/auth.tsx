// Auth context for managing user authentication state (M6)
import { createContext, useContext, useEffect, useState, ReactNode } from "react";

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

type AuthContextType = {
  user: User | null;
  organizations: Organization[];
  projects: Project[];
  currentProject: Project | null;
  setCurrentProject: (project: Project) => void;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
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
        setCurrentProjectState(saved || data.projects[0] || null);
      } else {
        setUser(null);
        setOrganizations([]);
        setProjects([]);
        setCurrentProjectState(null);
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
