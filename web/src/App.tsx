import { Link, NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { useEffect } from "react";
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
import ScoresAnalyticsPage from "./pages/ScoresAnalyticsPage";
import DatasetsPage from "./pages/DatasetsPage";
import DatasetDetailPage from "./pages/DatasetDetailPage";
import UsersAnalyticsPage from "./pages/UsersAnalyticsPage";
import { AuthProvider, useAuth } from "./lib/auth";
import { I18nProvider, useI18n } from "./lib/i18n";
import { ThemeProvider } from "./lib/theme";
import { useQueryClient } from "@tanstack/react-query";
import {
  AccountSettingsPage,
  AppearanceSettingsPage,
  SessionSettingsPage,
  SettingsLayout,
} from "./pages/SettingsPage";
import {
  BarChart3,
  Database,
  FileText,
  FlaskConical,
  KeyRound,
  ListTree,
  LogOut,
  PenLine,
  Play,
  Sparkles,
  Settings2,
  Users,
} from "lucide-react";

// =============================================================================
// Auth guards
// =============================================================================

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const { t } = useI18n();
  if (isLoading) return <div className="min-h-screen flex items-center justify-center text-neutral-500">{t("app.loading")}</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RedirectIfAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const { t } = useI18n();
  if (isLoading) return <div className="min-h-screen flex items-center justify-center text-neutral-500">{t("app.loading")}</div>;
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
            ? "bg-neutral-100 text-neutral-900 font-medium dark:bg-neutral-800 dark:text-neutral-50"
            : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800/70 dark:hover:text-neutral-50"
        }`
      }
    >
      <span className="w-4 h-4 flex items-center justify-center text-neutral-400 dark:text-neutral-500">
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
    <div className="px-2.5 pt-4 pb-1 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider dark:text-neutral-500">
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
  const { t } = useI18n();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <aside className="w-[220px] h-screen shrink-0 sticky top-0 bg-white border-r border-neutral-200 flex flex-col dark:bg-neutral-900 dark:border-neutral-800">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-neutral-100 shrink-0 dark:border-neutral-800">
        <div className="flex items-center justify-between gap-2">
          <Link to="/" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            <Sparkles className="h-5 w-5 text-amber-500" />
            Mini Langfuse
          </Link>
        </div>
      </div>

      {/* Project Selector */}
      <div className="px-3 py-3 border-b border-neutral-100 shrink-0 dark:border-neutral-800">
        <select
          value={currentProject?.id || ""}
          onChange={(e) => {
            const p = projects.find((p) => p.id === e.target.value);
            if (p) setCurrentProject(p);
          }}
          className="w-full text-xs font-medium border border-neutral-200 rounded-md px-2 py-1.5 bg-neutral-50 text-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-300 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-200 dark:focus:ring-neutral-600"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Navigation — only this area scrolls if nav items overflow */}
      <nav className="flex-1 min-h-0 px-2 py-2 overflow-y-auto">
        {/* Dashboard - top level */}
        <div className="space-y-0.5 mb-1">
          <NavItem to="/dashboard" icon={<BarChart3 className="h-4 w-4" />} label={t("nav.dashboard")} />
        </div>

        {/* Tracing */}
        <SectionLabel>{t("nav.tracing")}</SectionLabel>
        <div className="space-y-0.5">
          <NavItem to="/" end icon={<ListTree className="h-4 w-4" />} label={t("nav.traces")} />
          <NavItem to="/sessions" icon={<Sparkles className="h-4 w-4" />} label={t("nav.sessions")} />
          <NavItem to="/users" icon={<Users className="h-4 w-4" />} label={t("nav.users")} />
        </div>

        {/* Prompts */}
        <SectionLabel>{t("nav.promptsSection")}</SectionLabel>
        <div className="space-y-0.5">
          <NavItem to="/prompts" icon={<FileText className="h-4 w-4" />} label={t("nav.prompts")} />
          <NavItem to="/prompts/default/playground" icon={<Play className="h-4 w-4" />} label={t("nav.playground")} />
        </div>

        {/* Evaluation */}
        <SectionLabel>{t("nav.evaluation")}</SectionLabel>
        <div className="space-y-0.5">
          <NavItem to="/scores" icon={<BarChart3 className="h-4 w-4" />} label={t("nav.scores")} />
          <NavItem to="/evaluations" icon={<FlaskConical className="h-4 w-4" />} label={t("nav.evaluators")} />
          <NavItem to="/evaluations/runs" icon={<Play className="h-4 w-4" />} label={t("nav.runs")} />
          <NavItem to="/annotation" icon={<PenLine className="h-4 w-4" />} label={t("nav.annotation")} />
        </div>

        {/* Datasets */}
        <SectionLabel>{t("nav.datasetsSection")}</SectionLabel>
        <div className="space-y-0.5">
          <NavItem to="/datasets" icon={<Database className="h-4 w-4" />} label={t("nav.datasets")} />
        </div>

        {/* Settings */}
        <SectionLabel>{t("nav.settings")}</SectionLabel>
        <div className="space-y-0.5">
          <NavItem to="/settings/profile" icon={<Settings2 className="h-4 w-4" />} label={t("nav.settings")} />
          <NavItem to="/settings/api-keys" icon={<KeyRound className="h-4 w-4" />} label={t("nav.apiKeys")} />
        </div>
      </nav>

      {/* User Footer */}
      <div className="px-3 py-3 border-t border-neutral-100 shrink-0 dark:border-neutral-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-full bg-neutral-200 flex items-center justify-center text-[10px] font-medium text-neutral-600 shrink-0 dark:bg-neutral-700 dark:text-neutral-100">
              {user?.email?.[0]?.toUpperCase() || "U"}
            </div>
            <span className="text-xs text-neutral-600 truncate dark:text-neutral-300">{user?.email}</span>
          </div>
          <button
            onClick={handleLogout}
            title={t("nav.logout")}
            className="text-neutral-400 hover:text-neutral-600 p-1 dark:text-neutral-500 dark:hover:text-neutral-300"
          >
            <LogOut className="w-4 h-4" />
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
    <div className="flex h-screen overflow-hidden bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}

function ProjectScopeSync() {
  const { currentProject } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!currentProject) return;
    queryClient.invalidateQueries();
  }, [currentProject?.id, queryClient]);

  return null;
}

// =============================================================================
// App
// =============================================================================

export default function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <AuthProvider>
          <ProjectScopeSync />
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
                      <Route path="/users" element={<UsersAnalyticsPage />} />
                      <Route path="/prompts" element={<PromptListPage />} />
                      <Route path="/prompts/:name" element={<PromptDetailPage />} />
                      <Route path="/prompts/:name/playground" element={<PromptPlaygroundPage />} />
                      <Route path="/api-keys" element={<Navigate to="/settings/api-keys" replace />} />
                      <Route path="/settings" element={<SettingsLayout />}>
                        <Route index element={<Navigate to="profile" replace />} />
                        <Route path="organization" element={<Navigate to="profile" replace />} />
                        <Route path="profile" element={<AccountSettingsPage />} />
                        <Route path="appearance" element={<AppearanceSettingsPage />} />
                        <Route path="sessions" element={<SessionSettingsPage />} />
                        <Route path="api-keys" element={<ApiKeysPage />} />
                      </Route>
                      <Route path="/evaluations" element={<EvaluatorsPage />} />
                      <Route path="/evaluations/runs" element={<EvaluationRunsPage />} />
                      <Route path="/annotation" element={<AnnotationQueuePage />} />
                      <Route path="/scores" element={<ScoresAnalyticsPage />} />
                      <Route path="/datasets" element={<DatasetsPage />} />
                      <Route path="/datasets/:id" element={<DatasetDetailPage />} />
                    </Routes>
                  </MainLayout>
                </RequireAuth>
              }
            />
          </Routes>
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
