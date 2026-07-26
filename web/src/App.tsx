import { Link, NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import TraceListPage from "./pages/TraceListPage";
import TraceDetailPage from "./pages/TraceDetailPage";
import SessionListPage from "./pages/SessionListPage";
import SessionDetailPage from "./pages/SessionDetailPage";
import PromptListPage from "./pages/PromptListPage";
import PromptDetailPage from "./pages/PromptDetailPage";
import PromptPlaygroundPage from "./pages/PromptPlaygroundPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ApiKeysPage from "./pages/ApiKeysPage";
import { AuthProvider, useAuth } from "./lib/auth";

// Auth guard component
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-neutral-500">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

// Redirect to home if already logged in
function RedirectIfAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-neutral-500">Loading...</div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

// Header with user info and project switcher
function Header() {
  const { user, projects, currentProject, setCurrentProject, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <header className="border-b border-neutral-200 bg-white px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <Link to="/" className="text-lg font-semibold tracking-tight">
          🔦 Mini Langfuse
        </Link>
        <nav className="text-sm flex gap-4">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `hover:text-neutral-900 ${isActive ? "text-neutral-900 font-medium" : "text-neutral-600"}`
            }
          >
            Traces
          </NavLink>
          <NavLink
            to="/sessions"
            className={({ isActive }) =>
              `hover:text-neutral-900 ${isActive ? "text-neutral-900 font-medium" : "text-neutral-600"}`
            }
          >
            Sessions
          </NavLink>
          <NavLink
            to="/prompts"
            className={({ isActive }) =>
              `hover:text-neutral-900 ${isActive ? "text-neutral-900 font-medium" : "text-neutral-600"}`
            }
          >
            Prompts
          </NavLink>
          <NavLink
            to="/api-keys"
            className={({ isActive }) =>
              `hover:text-neutral-900 ${isActive ? "text-neutral-900 font-medium" : "text-neutral-600"}`
            }
          >
            API Keys
          </NavLink>
        </nav>
      </div>

      <div className="flex items-center gap-4">
        {/* Project Switcher */}
        {projects.length > 0 && currentProject && (
          <select
            value={currentProject.id}
            onChange={(e) => {
              const p = projects.find((p) => p.id === e.target.value);
              if (p) setCurrentProject(p);
            }}
            className="text-sm border border-neutral-200 rounded px-2 py-1 bg-white"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}

        {/* User menu */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-neutral-600">{user?.email}</span>
          <button
            onClick={handleLogout}
            className="text-neutral-500 hover:text-neutral-900"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}

// Main layout for authenticated pages
function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <Header />
      <main>{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public routes */}
        <Route
          path="/login"
          element={
            <RedirectIfAuth>
              <LoginPage />
            </RedirectIfAuth>
          }
        />
        <Route
          path="/register"
          element={
            <RedirectIfAuth>
              <RegisterPage />
            </RedirectIfAuth>
          }
        />

        {/* Protected routes */}
        <Route
          path="/*"
          element={
            <RequireAuth>
              <MainLayout>
                <Routes>
                  <Route path="/" element={<TraceListPage />} />
                  <Route path="/traces/:id" element={<TraceDetailPage />} />
                  <Route path="/sessions" element={<SessionListPage />} />
                  <Route path="/sessions/:id" element={<SessionDetailPage />} />
                  <Route path="/prompts" element={<PromptListPage />} />
                  <Route path="/prompts/:name" element={<PromptDetailPage />} />
                  <Route path="/prompts/:name/playground" element={<PromptPlaygroundPage />} />
                  <Route path="/api-keys" element={<ApiKeysPage />} />
                </Routes>
              </MainLayout>
            </RequireAuth>
          }
        />
      </Routes>
    </AuthProvider>
  );
}
