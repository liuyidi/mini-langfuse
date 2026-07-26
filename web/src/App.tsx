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
import DashboardPage from "./pages/DashboardPage";
import EvaluatorsPage from "./pages/EvaluatorsPage";
import EvaluationRunsPage from "./pages/EvaluationRunsPage";
import AnnotationQueuePage from "./pages/AnnotationQueuePage";
import { AuthProvider, useAuth } from "./lib/auth";

// =============================================================================
// Auth guards
// =============================================================================

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen flex items-center justify-center text-neutral-500">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RedirectIfAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen flex items-center justify-center text-neutral-500">Loading...</div>;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

// =============================================================================
// Sidebar nav item
// =============================================================================

type NavItemProps = {
  to: string;
  icon: React.ReactNode;
  label: string;
  end?: boolean;
};

function NavItem({ to, icon, label, end }: NavItemProps) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] transition-colors ${
          isActive
            ? "bg-neutral-100 text-neutral-900 font-medium"
            : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
        }`
      }
    >
      <span className="w-4 h-4 flex items-center justify-center text-neutral-400">
        {icon}
      </span>
      {label}
    </NavLink>
  );
}

// =============================================================================
// Section label
// =============================================================================

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 pt-4 pb-1 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
      {children}
    </div>
  );
}

// =============================================================================
// Sidebar
// =============================================================================

function Sidebar() {
  const { user, projects, currentProject, setCurrentProject, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <aside className="w-[220px] min-h-screen bg-white border-r border-neutral-200 flex flex-col">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-neutral-100">
        <Link to="/" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-neutral-900">
          <span className="text-lg">🔦</span>
          Mini Langfuse
        </Link>
      </div>

      {/* Project Selector */}
      <div className="px-3 py-3 border-b border-neutral-100">
        <select
          value={currentProject?.id || ""}
          onChange={(e) => {
            const p = projects.find((p) => p.id === e.target.value);
            if (p) setCurrentProject(p);
          }}
          className="w-full text-xs font-medium border border-neutral-200 rounded-md px-2 py-1.5 bg-neutral-50 text-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-300"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-2 overflow-y-auto">
        {/* Dashboard - top level */}
        <div className="space-y-0.5 mb-1">
          <NavItem to="/dashboard" icon={
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
              <path d="M2 14V6h3v8M6.5 14V2h3v12M11 14V8h3v6" />
            </svg>
          } label="Dashboard" />
        </div>

        {/* Tracing */}
        <SectionLabel>Tracing</SectionLabel>
        <div className="space-y-0.5">
          <NavItem to="/" end icon={
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
              <path d="M2 4h12M2 8h12M2 12h8" />
            </svg>
          } label="Traces" />
          <NavItem to="/sessions" icon={
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
              <rect x="2" y="2" width="5" height="5" rx="1" />
              <rect x="9" y="2" width="5" height="5" rx="1" />
              <rect x="2" y="9" width="5" height="5" rx="1" />
              <rect x="9" y="9" width="5" height="5" rx="1" />
            </svg>
          } label="Sessions" />
        </div>

        {/* Prompts */}
        <SectionLabel>Prompts</SectionLabel>
        <div className="space-y-0.5">
          <NavItem to="/prompts" icon={
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
              <path d="M3 3h10v2H3zM3 7h7v2H3zM3 11h10v2H3z" />
            </svg>
          } label="Prompts" />
          <NavItem to="/prompts/default/playground" icon={
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
              <path d="M4 2l8 6-8 6V2z" />
            </svg>
          } label="Playground" />
        </div>

        {/* Evaluation */}
        <SectionLabel>Evaluation</SectionLabel>
        <div className="space-y-0.5">
          <NavItem to="/evaluations" icon={
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
              <path d="M8 2l1.5 3.5L13 6l-2.5 2.5L11 12 8 10l-3 2 .5-3.5L3 6l3.5-.5L8 2z" />
            </svg>
          } label="Evaluators" />
          <NavItem to="/evaluations/runs" icon={
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
              <circle cx="8" cy="8" r="6" />
              <path d="M8 5v3l2 2" />
            </svg>
          } label="Runs" />
          <NavItem to="/annotation" icon={
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
              <path d="M2 12l3-8 3 8M3 9h4" />
              <path d="M10 4h4v8" />
            </svg>
          } label="Annotation" />
        </div>

        {/* Settings */}
        <SectionLabel>Settings</SectionLabel>
        <div className="space-y-0.5">
          <NavItem to="/api-keys" icon={
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
              <circle cx="6" cy="8" r="3" />
              <path d="M9 8h5M12 6v4" />
            </svg>
          } label="API Keys" />
        </div>
      </nav>

      {/* User Footer */}
      <div className="px-3 py-3 border-t border-neutral-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-full bg-neutral-200 flex items-center justify-center text-[10px] font-medium text-neutral-600 shrink-0">
              {user?.email?.[0]?.toUpperCase() || "U"}
            </div>
            <span className="text-xs text-neutral-600 truncate">{user?.email}</span>
          </div>
          <button
            onClick={handleLogout}
            title="Logout"
            className="text-neutral-400 hover:text-neutral-600 p-1"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
              <path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3M11 11l3-3-3-3M6 8h8" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}

// =============================================================================
// Main layout: Sidebar + content
// =============================================================================

function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-neutral-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}

// =============================================================================
// App
// =============================================================================

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<RedirectIfAuth><LoginPage /></RedirectIfAuth>} />
        <Route path="/register" element={<RedirectIfAuth><RegisterPage /></RedirectIfAuth>} />

        {/* Protected routes */}
        <Route
          path="/*"
          element={
            <RequireAuth>
              <MainLayout>
                <Routes>
                  <Route path="/" element={<TraceListPage />} />
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/traces/:id" element={<TraceDetailPage />} />
                  <Route path="/sessions" element={<SessionListPage />} />
                  <Route path="/sessions/:id" element={<SessionDetailPage />} />
                  <Route path="/prompts" element={<PromptListPage />} />
                  <Route path="/prompts/:name" element={<PromptDetailPage />} />
                  <Route path="/prompts/:name/playground" element={<PromptPlaygroundPage />} />
                  <Route path="/api-keys" element={<ApiKeysPage />} />
                  <Route path="/evaluations" element={<EvaluatorsPage />} />
                  <Route path="/evaluations/runs" element={<EvaluationRunsPage />} />
                  <Route path="/annotation" element={<AnnotationQueuePage />} />
                </Routes>
              </MainLayout>
            </RequireAuth>
          }
        />
      </Routes>
    </AuthProvider>
  );
}
