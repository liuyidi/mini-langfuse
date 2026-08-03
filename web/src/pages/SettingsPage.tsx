import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { organizationsApi, type OrganizationProject } from "../api/organizations";
import { LanguageSwitcher, useI18n } from "../lib/i18n";
import { useTheme, type ThemeMode } from "../lib/theme";
import { formatTime } from "../lib/format";

type SessionItem = {
  token: string;
  created_at: string;
  expires_at: string;
  is_current: boolean;
};

function ShellCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900 ${className}`}>
      {children}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-sm font-medium text-neutral-800 dark:text-neutral-100">{label}</div>
      {children}
      {hint && <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{hint}</div>}
    </label>
  );
}

function inputClass() {
  return "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50 dark:focus:border-neutral-500 dark:focus:ring-neutral-800";
}

function buttonClass(primary = false) {
  return primary
    ? "inline-flex items-center justify-center rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 dark:bg-neutral-50 dark:text-neutral-900 dark:hover:bg-neutral-200"
    : "inline-flex items-center justify-center rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50 dark:hover:bg-neutral-900";
}

export function SettingsLayout() {
  const { t } = useI18n();
  return (
    <div className="p-6 max-w-[1280px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
          {t("settings.title")}
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          {t("settings.subtitle")}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-6 h-fit">
          <ShellCard className="p-2">
            <SettingsNav />
          </ShellCard>
        </aside>
        <main className="min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function SettingsNav() {
  const { t } = useI18n();
  return (
    <nav className="space-y-4">
      <SettingsSection label={t("settings.sectionAccount")}>
        <SettingsNavItem to="/settings/profile" label={t("settings.profile")} />
      </SettingsSection>
      <SettingsSection label={t("settings.sectionSecurity")}>
        <SettingsNavItem to="/settings/sessions" label={t("settings.sessions")} />
        <SettingsNavItem to="/settings/api-keys" label={t("nav.apiKeys")} />
      </SettingsSection>
      <SettingsSection label={t("settings.sectionAppearance")}>
        <SettingsNavItem to="/settings/appearance" label={t("settings.appearance")} />
      </SettingsSection>
    </nav>
  );
}

function SettingsSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
        {label}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function SettingsNavItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `block rounded-lg px-3 py-2 text-sm transition ${
          isActive
            ? "bg-neutral-100 text-neutral-900 font-medium dark:bg-neutral-800 dark:text-neutral-50"
            : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800/60 dark:hover:text-neutral-50"
        }`
      }
    >
      {label}
    </NavLink>
  );
}

export function AccountSettingsPage() {
  const { user, updateProfile, changePassword, deleteAccount } = useAuth();
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");
  const [passwordCurrent, setPasswordCurrent] = useState("");
  const [passwordNext, setPasswordNext] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteMessage, setDeleteMessage] = useState("");
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    setName(user?.name ?? "");
    setEmail(user?.email ?? "");
  }, [user]);

  const changedEmail = useMemo(() => (user?.email ?? "") !== email.trim(), [email, user?.email]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError("");
    setProfileMessage("");
    try {
      await updateProfile({
        name,
        email: email.trim() || null,
        currentPassword: changedEmail ? currentPassword : undefined,
      });
      setCurrentPassword("");
      setProfileMessage(t("settings.profileSaved"));
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : t("settings.profileFailed"));
    }
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordMessage("");
    if (passwordNext !== passwordConfirm) {
      setPasswordError(t("settings.passwordMismatch"));
      return;
    }
    try {
      await changePassword({
        currentPassword: passwordCurrent,
        newPassword: passwordNext,
      });
      setPasswordCurrent("");
      setPasswordNext("");
      setPasswordConfirm("");
      setPasswordMessage(t("settings.passwordSaved"));
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : t("settings.passwordFailed"));
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteError("");
    setDeleteMessage("");
    if (deleteConfirm.trim().toLowerCase() !== "delete my account") {
      setDeleteError(t("settings.deleteConfirmMismatch"));
      return;
    }
    try {
      await deleteAccount({ currentPassword: deletePassword });
      setDeleteMessage(t("settings.deleteSuccess"));
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : t("settings.deleteFailed"));
    }
  };

  return (
    <div className="space-y-6">
      <ShellCard>
        <div className="border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">{t("settings.profile")}</h2>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{t("settings.profileDescription")}</p>
        </div>
        <form className="space-y-5 p-5" onSubmit={saveProfile}>
          {profileError && <Notice tone="error">{profileError}</Notice>}
          {profileMessage && <Notice tone="success">{profileMessage}</Notice>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("settings.displayName")}>
              <input className={inputClass()} value={name} onChange={(e) => setName(e.target.value)} placeholder="Alice" />
            </Field>
            <Field label={t("settings.email")}>
              <input className={inputClass()} value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@example.com" />
            </Field>
          </div>
          {changedEmail && (
            <Field label={t("settings.currentPassword")} hint={t("settings.emailChangeHint")}>
              <input
                className={inputClass()}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                type="password"
                placeholder="••••••••"
              />
            </Field>
          )}
          <div className="flex justify-end">
            <button type="submit" className={buttonClass(true)}>
              {t("settings.saveChanges")}
            </button>
          </div>
        </form>
      </ShellCard>

      <ShellCard>
        <div className="border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">{t("settings.password")}</h2>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{t("settings.passwordDescription")}</p>
        </div>
        <form className="space-y-5 p-5" onSubmit={savePassword}>
          {passwordError && <Notice tone="error">{passwordError}</Notice>}
          {passwordMessage && <Notice tone="success">{passwordMessage}</Notice>}
          <Field label={t("settings.currentPassword")}>
            <input className={inputClass()} value={passwordCurrent} onChange={(e) => setPasswordCurrent(e.target.value)} type="password" placeholder="••••••••" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("settings.newPassword")}>
              <input className={inputClass()} value={passwordNext} onChange={(e) => setPasswordNext(e.target.value)} type="password" placeholder="••••••••" />
            </Field>
            <Field label={t("settings.confirmPassword")}>
              <input className={inputClass()} value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} type="password" placeholder="••••••••" />
            </Field>
          </div>
          <div className="flex justify-end">
            <button type="submit" className={buttonClass(true)}>
              {t("settings.changePassword")}
            </button>
          </div>
        </form>
      </ShellCard>

      <ShellCard>
        <div className="border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <h2 className="text-lg font-semibold text-red-700 dark:text-red-300">{t("settings.deleteAccount")}</h2>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{t("settings.deleteDescription")}</p>
        </div>
        <form className="space-y-5 p-5" onSubmit={handleDeleteAccount}>
          {deleteError && <Notice tone="error">{deleteError}</Notice>}
          {deleteMessage && <Notice tone="success">{deleteMessage}</Notice>}
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
            <div className="font-medium">{t("settings.deleteWarningTitle")}</div>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>{t("settings.deleteWarning1")}</li>
              <li>{t("settings.deleteWarning2")}</li>
              <li>{t("settings.deleteWarning3")}</li>
            </ul>
          </div>
          <Field label={t("settings.deletePassword")}>
            <input
              className={inputClass()}
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              type="password"
              placeholder="••••••••"
            />
          </Field>
          <Field label={t("settings.deleteConfirm")}>
            <input
              className={inputClass()}
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="delete my account"
            />
          </Field>
          <div className="flex justify-end">
            <button type="submit" className="inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600">
              {t("settings.deleteAccount")}
            </button>
          </div>
        </form>
      </ShellCard>
    </div>
  );
}

function Notice({ tone, children }: { tone: "error" | "success"; children: React.ReactNode }) {
  const classes =
    tone === "error"
      ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
      : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200";
  return <div className={`rounded-lg border px-3 py-2 text-sm ${classes}`}>{children}</div>;
}

export function AppearanceSettingsPage() {
  const { t } = useI18n();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [tab, setTab] = useState<"theme" | "language">("theme");

  const modes: { key: ThemeMode; label: string; description: string }[] = [
    { key: "system", label: t("settings.themeSystem"), description: t("settings.themeSystemDesc") },
    { key: "light", label: t("settings.themeLight"), description: t("settings.themeLightDesc") },
    { key: "dark", label: t("settings.themeDark"), description: t("settings.themeDarkDesc") },
  ];

  return (
    <ShellCard>
      <div className="border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">{t("settings.appearance")}</h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{t("settings.appearanceDescription")}</p>
      </div>
      <div className="p-5">
        <div className="inline-flex rounded-lg border border-neutral-200 bg-neutral-50 p-1 dark:border-neutral-800 dark:bg-neutral-950">
          <button
            type="button"
            onClick={() => setTab("theme")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              tab === "theme"
                ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-900 dark:text-neutral-50"
                : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-50"
            }`}
          >
            {t("settings.theme")}
          </button>
          <button
            type="button"
            onClick={() => setTab("language")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              tab === "language"
                ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-900 dark:text-neutral-50"
                : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-50"
            }`}
          >
            {t("settings.language")}
          </button>
        </div>

        {tab === "theme" ? (
          <div className="mt-4 space-y-3">
            <div className="grid gap-2 sm:grid-cols-3">
              {modes.map((mode) => (
                <button
                  key={mode.key}
                  type="button"
                  onClick={() => setTheme(mode.key)}
                  className={`rounded-lg border px-3 py-2 text-left transition ${
                    theme === mode.key
                      ? "border-neutral-900 bg-neutral-50 dark:border-neutral-100 dark:bg-neutral-800/60"
                      : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:border-neutral-700 dark:hover:bg-neutral-900"
                  }`}
                >
                  <div className="font-medium text-sm text-neutral-900 dark:text-neutral-50">{mode.label}</div>
                  <div className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{mode.description}</div>
                </button>
              ))}
            </div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              {t("settings.resolvedTheme")}: <span className="font-medium text-neutral-700 dark:text-neutral-200">{resolvedTheme}</span>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex items-center justify-between gap-4 rounded-lg border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-950">
            <div>
              <div className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{t("settings.languageTitle")}</div>
              <div className="text-sm text-neutral-500 dark:text-neutral-400">{t("settings.languageDescription")}</div>
            </div>
            <LanguageSwitcher />
          </div>
        )}
      </div>
    </ShellCard>
  );
}

export function OrganizationSettingsPage() {
  const { organizations, currentProject, setCurrentProject, refresh } = useAuth();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [orgName, setOrgName] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectName, setEditingProjectName] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const currentOrgId = currentProject?.org_id ?? organizations[0]?.id ?? null;
  const orgQ = useQuery({
    queryKey: ["organization", currentOrgId],
    queryFn: () => organizationsApi.get(currentOrgId!),
    enabled: !!currentOrgId,
  });

  useEffect(() => {
    if (orgQ.data) {
      setOrgName(orgQ.data.name);
      setNewProjectName("");
      setEditingProjectId(null);
      setEditingProjectName("");
    }
  }, [orgQ.data?.id]);

  const currentOrg = orgQ.data;

  const handleError = (err: unknown, fallback: string) => {
    setErrorMessage(err instanceof Error ? err.message : fallback);
    setStatusMessage("");
  };

  const updateOrgMut = useMutation({
    mutationFn: () => organizationsApi.update(currentOrgId!, orgName),
    onSuccess: async () => {
      setStatusMessage(t("settings.organizationSaved"));
      setErrorMessage("");
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ["organization", currentOrgId] });
    },
    onError: (err) => handleError(err, t("settings.organizationFailed")),
  });

  const createProjectMut = useMutation({
    mutationFn: () => organizationsApi.createProject(currentOrgId!, newProjectName),
    onSuccess: async () => {
      setNewProjectName("");
      setStatusMessage(t("settings.projectCreated"));
      setErrorMessage("");
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ["organization", currentOrgId] });
    },
    onError: (err) => handleError(err, t("settings.projectCreateFailed")),
  });

  const renameProjectMut = useMutation({
    mutationFn: (projectId: string) => organizationsApi.updateProject(projectId, editingProjectName),
    onSuccess: async () => {
      setEditingProjectId(null);
      setEditingProjectName("");
      setStatusMessage(t("settings.projectRenamed"));
      setErrorMessage("");
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ["organization", currentOrgId] });
    },
    onError: (err) => handleError(err, t("settings.projectRenameFailed")),
  });

  const beginRenameProject = (project: OrganizationProject) => {
    setEditingProjectId(project.id);
    setEditingProjectName(project.name);
    setStatusMessage("");
    setErrorMessage("");
  };

  return (
    <div className="space-y-6">
      <ShellCard>
        <div className="border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">{t("settings.organization")}</h2>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            {t("settings.organizationDescription")}
          </p>
        </div>
        <div className="space-y-5 p-5">
          {statusMessage && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200">
              {statusMessage}
            </div>
          )}
          {errorMessage && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
              {errorMessage}
            </div>
          )}
          {!currentOrgId || organizations.length === 0 ? (
            <div className="rounded-lg border border-dashed border-neutral-300 px-4 py-6 text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
              {t("settings.noOrganizations")}
            </div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!currentOrgId || !orgName.trim()) return;
                    updateOrgMut.mutate();
                  }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{t("settings.renameOrganization")}</div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400 font-mono">{currentOrg?.id}</div>
                    </div>
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-200">
                      {currentOrg?.role}
                    </span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <input
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      className={inputClass()}
                      placeholder={t("settings.organization")}
                    />
                    <button type="submit" disabled={updateOrgMut.isPending || !orgName.trim()} className={buttonClass(true)}>
                      {updateOrgMut.isPending ? t("settings.saveChanges") : t("settings.saveChanges")}
                    </button>
                  </div>
                </form>
              </div>

              <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
                <div className="mb-3">
                  <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{t("settings.createProject")}</h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">{t("settings.noProjectsInOrg")}</p>
                </div>
                <form
                  className="flex flex-col gap-3 sm:flex-row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!currentOrgId || !newProjectName.trim()) return;
                    createProjectMut.mutate();
                  }}
                >
                  <input
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    className={inputClass()}
                    placeholder={t("settings.projectName")}
                  />
                  <button type="submit" disabled={createProjectMut.isPending || !newProjectName.trim()} className={buttonClass(true)}>
                    {t("settings.createProject")}
                  </button>
                </form>
              </div>

              <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{t("settings.members")}</h3>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">{t("settings.membersDescription")}</p>
                  </div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">
                    {(currentOrg?.members.length ?? 0)} {t("settings.members")}
                  </div>
                </div>
                <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
                  <table className="min-w-full text-sm">
                    <thead className="bg-neutral-50 text-left text-[11px] uppercase tracking-wide text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
                      <tr>
                        <th className="px-4 py-2">{t("settings.displayName")}</th>
                        <th className="px-4 py-2">{t("settings.email")}</th>
                        <th className="px-4 py-2">{t("settings.orgRole")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                      {(currentOrg?.members ?? []).map((member) => (
                        <tr key={member.user_id} className="bg-white dark:bg-neutral-950">
                          <td className="px-4 py-3 text-neutral-900 dark:text-neutral-50">{member.name || "—"}</td>
                          <td className="px-4 py-3 font-mono text-xs text-neutral-600 dark:text-neutral-300">{member.email}</td>
                          <td className="px-4 py-3">
                            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                              {member.role}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{t("settings.projects")}</h3>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">{t("settings.organizationDescription")}</p>
                  </div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">
                    {(currentOrg?.projects.length ?? 0)} {t("settings.projects")}
                  </div>
                </div>

                <div className="space-y-2">
                  {(currentOrg?.projects ?? []).length === 0 ? (
                    <div className="text-sm text-neutral-500 dark:text-neutral-400">
                      {t("settings.noProjectsInOrg")}
                    </div>
                  ) : (
                    (currentOrg?.projects ?? []).map((project) => {
                      const active = currentProject?.id === project.id;
                      const isEditing = editingProjectId === project.id;
                      return (
                        <div
                          key={project.id}
                          className={`rounded-lg border p-3 ${
                            active
                              ? "border-blue-200 bg-blue-50 dark:border-blue-900/50 dark:bg-blue-950/30"
                              : "border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900"
                          }`}
                        >
                          {isEditing ? (
                            <form
                              className="flex flex-col gap-2 sm:flex-row sm:items-center"
                              onSubmit={(e) => {
                                e.preventDefault();
                                if (!editingProjectName.trim()) return;
                                renameProjectMut.mutate(project.id);
                              }}
                            >
                              <input
                                className={inputClass()}
                                value={editingProjectName}
                                onChange={(e) => setEditingProjectName(e.target.value)}
                              />
                              <div className="flex gap-2">
                                <button type="button" className={buttonClass()} onClick={() => setEditingProjectId(null)}>
                                  {t("settings.cancel")}
                                </button>
                                <button type="submit" disabled={renameProjectMut.isPending || !editingProjectName.trim()} className={buttonClass(true)}>
                                  {t("settings.rename")}
                                </button>
                              </div>
                            </form>
                          ) : (
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="font-medium text-neutral-900 dark:text-neutral-50">{project.name}</div>
                                <div className="text-xs text-neutral-500 dark:text-neutral-400 font-mono">{project.id}</div>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  disabled={active}
                                  onClick={() => setCurrentProject({ id: project.id, name: project.name, org_id: project.org_id })}
                                  className={buttonClass()}
                                >
                                  {active ? t("settings.currentProject") : t("settings.switchProject")}
                                </button>
                                <button type="button" onClick={() => beginRenameProject(project)} className={buttonClass()}>
                                  {t("settings.rename")}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </ShellCard>
    </div>
  );
}

export function SessionSettingsPage() {
  const { t } = useI18n();
  const { listSessions, revokeSession, logout } = useAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyToken, setBusyToken] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setSessions(await listSessions());
    } catch (err) {
      setError(err instanceof Error ? err.message : t("settings.sessionsFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleRevoke = async (session: SessionItem) => {
    setBusyToken(session.token);
    try {
      const result = await revokeSession(session.token);
      if (result.revoked_current) {
        await logout();
        navigate("/login");
        return;
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("settings.sessionsFailed"));
    } finally {
      setBusyToken(null);
    }
  };

  return (
    <ShellCard>
      <div className="border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">{t("settings.sessions")}</h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{t("settings.sessionsDescription")}</p>
      </div>
      <div className="space-y-4 p-5">
        {error && <Notice tone="error">{error}</Notice>}
        {loading ? (
          <div className="text-sm text-neutral-500 dark:text-neutral-400">{t("settings.loadingSessions")}</div>
        ) : sessions.length === 0 ? (
          <div className="text-sm text-neutral-500 dark:text-neutral-400">{t("settings.noSessions")}</div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-50 text-left text-[11px] uppercase tracking-wide text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
                <tr>
                  <th className="px-4 py-2">{t("settings.session")}</th>
                  <th className="px-4 py-2">{t("settings.createdAt")}</th>
                  <th className="px-4 py-2">{t("settings.expiresAt")}</th>
                  <th className="px-4 py-2">{t("settings.status")}</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {sessions.map((session) => (
                  <tr key={session.token} className="bg-white dark:bg-neutral-950">
                    <td className="px-4 py-3 font-mono text-xs text-neutral-700 dark:text-neutral-200">
                      {session.token.slice(0, 10)}…
                    </td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-300">{formatTime(session.created_at)}</td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-300">{formatTime(session.expires_at)}</td>
                    <td className="px-4 py-3">
                      {session.is_current ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">
                          {t("settings.current")}
                        </span>
                      ) : (
                        <span className="text-neutral-500 dark:text-neutral-400">{t("settings.otherSession")}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={busyToken === session.token}
                        onClick={() => void handleRevoke(session)}
                        className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                      >
                        {busyToken === session.token ? t("settings.revoking") : t("settings.revoke")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ShellCard>
  );
}
