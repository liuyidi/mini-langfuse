/** Lightweight zh-CN / en i18n for mini-langfuse Web (no extra deps). */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Locale = "zh-CN" | "en";

export const LOCALE_STORAGE_KEY = "mlf.locale";

const messages = {
  "zh-CN": {
    "app.loading": "加载中…",
    "nav.dashboard": "仪表盘",
    "nav.tracing": "链路追踪",
    "nav.traces": "Traces",
    "nav.sessions": "Sessions",
    "nav.users": "用户",
    "nav.prompts": "提示词",
    "nav.promptsSection": "提示词",
    "nav.playground": "Playground",
    "nav.evaluation": "评测",
    "nav.scores": "Scores",
    "nav.evaluators": "评测器",
    "nav.runs": "运行记录",
    "nav.annotation": "标注",
    "nav.datasets": "数据集",
    "nav.datasetsSection": "数据集",
    "nav.settings": "设置",
    "nav.apiKeys": "API Keys",
    "nav.logout": "退出登录",
    "lang.label": "语言",
    "lang.zh": "简体中文",
    "lang.en": "English",
    "login.title": "登录账号",
    "login.email": "邮箱",
    "login.password": "密码",
    "login.submit": "登录",
    "login.submitting": "登录中…",
    "login.noAccount": "还没有账号？",
    "login.register": "注册",
    "login.failed": "登录失败",
    "register.title": "创建账号",
    "register.submit": "注册",
    "register.submitting": "注册中…",
    "register.hasAccount": "已有账号？",
    "register.login": "登录",
    "register.failed": "注册失败",
    "register.name": "姓名（可选）",
    "register.passwordHint": "至少 8 个字符",
    "register.footnote": "首位注册用户会自动创建默认组织与项目。",
    "settings.title": "设置",
    "settings.subtitle": "管理个人资料、会话与外观偏好。",
    "settings.sectionOrganization": "组织",
    "settings.sectionAccount": "账号",
    "settings.sectionSecurity": "安全",
    "settings.sectionAppearance": "外观",
    "settings.organization": "组织与项目",
    "settings.organizationDescription": "查看你所属的组织、角色和可访问的项目。",
    "settings.noOrganizations": "当前账号还没有加入任何组织。",
    "settings.currentOrg": "当前组织",
    "settings.orgRole": "组织角色",
    "settings.members": "成员",
    "settings.membersDescription": "查看组织里的成员和角色。",
    "settings.renameOrganization": "重命名组织",
    "settings.organizationSaved": "组织已更新。",
    "settings.organizationFailed": "更新组织失败",
    "settings.projectName": "项目名称",
    "settings.createProject": "新建项目",
    "settings.projectCreated": "项目已创建。",
    "settings.projectCreateFailed": "新建项目失败",
    "settings.renameProject": "重命名项目",
    "settings.projectRenamed": "项目已更新。",
    "settings.projectRenameFailed": "更新项目失败",
    "settings.projects": "个项目",
    "settings.noProjectsInOrg": "这个组织当前没有可用项目。",
    "settings.switchProject": "切换",
    "settings.currentProject": "当前项目",
    "settings.rename": "重命名",
    "settings.cancel": "取消",
    "settings.profile": "个人资料",
    "settings.appearance": "外观",
    "settings.sessions": "会话",
    "settings.profileDescription": "更新你的显示名称和邮箱地址。",
    "settings.displayName": "显示名称",
    "settings.email": "邮箱",
    "settings.currentPassword": "当前密码",
    "settings.emailChangeHint": "修改邮箱时需要验证当前密码。",
    "settings.saveChanges": "保存更改",
    "settings.profileSaved": "个人资料已更新。",
    "settings.profileFailed": "更新个人资料失败",
    "settings.password": "密码",
    "settings.passwordDescription": "修改登录密码。",
    "settings.newPassword": "新密码",
    "settings.confirmPassword": "确认新密码",
    "settings.changePassword": "修改密码",
    "settings.passwordSaved": "密码已更新。",
    "settings.passwordFailed": "修改密码失败",
    "settings.passwordMismatch": "两次输入的新密码不一致。",
    "settings.sessionsDescription": "查看并撤销当前账号的浏览器会话。",
    "settings.loadingSessions": "正在加载会话…",
    "settings.noSessions": "当前没有可展示的会话。",
    "settings.session": "会话",
    "settings.createdAt": "创建时间",
    "settings.expiresAt": "过期时间",
    "settings.status": "状态",
    "settings.current": "当前会话",
    "settings.otherSession": "其他会话",
    "settings.revoke": "撤销",
    "settings.revoking": "撤销中…",
    "settings.sessionsFailed": "加载会话失败",
    "settings.appearanceDescription": "选择浅色、深色或跟随系统。",
    "settings.language": "语言",
    "settings.languageTitle": "界面语言",
    "settings.languageDescription": "切换应用中显示的语言。",
    "settings.theme": "主题",
    "settings.themeLight": "浅色",
    "settings.themeDark": "深色",
    "settings.themeSystem": "跟随系统",
    "settings.themeLightDesc": "始终使用浅色外观。",
    "settings.themeDarkDesc": "始终使用深色外观。",
    "settings.themeSystemDesc": "根据操作系统偏好自动切换。",
    "settings.active": "已启用",
    "settings.preview": "预览",
    "settings.resolvedTheme": "当前生效主题",
    "settings.deleteAccount": "删除账号",
    "settings.deleteDescription": "永久删除你的个人账号。",
    "settings.deleteWarningTitle": "删除后将无法恢复",
    "settings.deleteWarning1": "你会立即失去当前登录状态。",
    "settings.deleteWarning2": "你的浏览器会话和组织成员关系会被移除。",
    "settings.deleteWarning3": "项目和观测数据会暂时保留。",
    "settings.deletePassword": "确认密码",
    "settings.deleteConfirm": "输入 delete my account 继续",
    "settings.deleteConfirmMismatch": "请输入 delete my account 以确认删除。",
    "settings.deleteFailed": "删除账号失败",
    "settings.deleteSuccess": "账号已删除。",
  },
  en: {
    "app.loading": "Loading...",
    "nav.dashboard": "Dashboard",
    "nav.tracing": "Tracing",
    "nav.traces": "Traces",
    "nav.sessions": "Sessions",
    "nav.users": "Users",
    "nav.prompts": "Prompts",
    "nav.promptsSection": "Prompts",
    "nav.playground": "Playground",
    "nav.evaluation": "Evaluation",
    "nav.scores": "Scores",
    "nav.evaluators": "Evaluators",
    "nav.runs": "Runs",
    "nav.annotation": "Annotation",
    "nav.datasets": "Datasets",
    "nav.datasetsSection": "Datasets",
    "nav.settings": "Settings",
    "nav.apiKeys": "API Keys",
    "nav.logout": "Logout",
    "lang.label": "Language",
    "lang.zh": "简体中文",
    "lang.en": "English",
    "login.title": "Sign in to your account",
    "login.email": "Email",
    "login.password": "Password",
    "login.submit": "Sign in",
    "login.submitting": "Signing in...",
    "login.noAccount": "Don't have an account?",
    "login.register": "Register",
    "login.failed": "Login failed",
    "register.title": "Create your account",
    "register.submit": "Create account",
    "register.submitting": "Creating account...",
    "register.hasAccount": "Already have an account?",
    "register.login": "Sign in",
    "register.failed": "Registration failed",
    "register.name": "Name (optional)",
    "register.passwordHint": "Minimum 8 characters",
    "register.footnote": "The first user to register will automatically create a default organization and project.",
    "settings.title": "Settings",
    "settings.subtitle": "Manage your profile, sessions, and appearance preferences.",
    "settings.sectionOrganization": "Organization",
    "settings.sectionAccount": "Account",
    "settings.sectionSecurity": "Security",
    "settings.sectionAppearance": "Appearance",
    "settings.organization": "Organizations & projects",
    "settings.organizationDescription": "View the organizations you belong to, your role, and the projects you can access.",
    "settings.noOrganizations": "This account is not part of any organization yet.",
    "settings.currentOrg": "Current org",
    "settings.orgRole": "Org role",
    "settings.members": "Members",
    "settings.membersDescription": "View the members and roles in this organization.",
    "settings.renameOrganization": "Rename organization",
    "settings.organizationSaved": "Organization updated.",
    "settings.organizationFailed": "Failed to update organization",
    "settings.projectName": "Project name",
    "settings.createProject": "Create project",
    "settings.projectCreated": "Project created.",
    "settings.projectCreateFailed": "Failed to create project",
    "settings.renameProject": "Rename project",
    "settings.projectRenamed": "Project updated.",
    "settings.projectRenameFailed": "Failed to update project",
    "settings.projects": "projects",
    "settings.noProjectsInOrg": "This organization has no available projects.",
    "settings.switchProject": "Switch",
    "settings.currentProject": "Current project",
    "settings.rename": "Rename",
    "settings.cancel": "Cancel",
    "settings.profile": "Profile",
    "settings.appearance": "Appearance",
    "settings.sessions": "Sessions",
    "settings.profileDescription": "Update your display name and email address.",
    "settings.displayName": "Display name",
    "settings.email": "Email",
    "settings.currentPassword": "Current password",
    "settings.emailChangeHint": "Changing your email requires your current password.",
    "settings.saveChanges": "Save changes",
    "settings.profileSaved": "Profile updated.",
    "settings.profileFailed": "Failed to update profile",
    "settings.password": "Password",
    "settings.passwordDescription": "Change the password you use to sign in.",
    "settings.newPassword": "New password",
    "settings.confirmPassword": "Confirm new password",
    "settings.changePassword": "Change password",
    "settings.passwordSaved": "Password updated.",
    "settings.passwordFailed": "Failed to change password",
    "settings.passwordMismatch": "The new passwords do not match.",
    "settings.sessionsDescription": "Review and revoke browser sessions for this account.",
    "settings.loadingSessions": "Loading sessions...",
    "settings.noSessions": "No sessions to show right now.",
    "settings.session": "Session",
    "settings.createdAt": "Created",
    "settings.expiresAt": "Expires",
    "settings.status": "Status",
    "settings.current": "Current session",
    "settings.otherSession": "Other session",
    "settings.revoke": "Revoke",
    "settings.revoking": "Revoking...",
    "settings.sessionsFailed": "Failed to load sessions",
    "settings.appearanceDescription": "Choose light, dark, or system-following appearance.",
    "settings.language": "Language",
    "settings.languageTitle": "Interface language",
    "settings.languageDescription": "Switch the language used across the app.",
    "settings.theme": "Theme",
    "settings.themeLight": "Light",
    "settings.themeDark": "Dark",
    "settings.themeSystem": "System",
    "settings.themeLightDesc": "Always use the light appearance.",
    "settings.themeDarkDesc": "Always use the dark appearance.",
    "settings.themeSystemDesc": "Automatically follow your operating system.",
    "settings.active": "Active",
    "settings.preview": "Preview",
    "settings.resolvedTheme": "Resolved theme",
    "settings.deleteAccount": "Delete account",
    "settings.deleteDescription": "Permanently delete your personal account.",
    "settings.deleteWarningTitle": "This cannot be undone",
    "settings.deleteWarning1": "You will lose the current session immediately.",
    "settings.deleteWarning2": "Your browser sessions and membership records will be removed.",
    "settings.deleteWarning3": "Projects and observability data are preserved for now.",
    "settings.deletePassword": "Confirm password",
    "settings.deleteConfirm": "Type delete my account to continue",
    "settings.deleteConfirmMismatch": "Type delete my account to confirm deletion.",
    "settings.deleteFailed": "Failed to delete account",
    "settings.deleteSuccess": "Account deleted.",
  },
} as const;

export type MessageKey = keyof (typeof messages)["zh-CN"];

type I18nValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

function readStoredLocale(): Locale {
  if (typeof window === "undefined") return "zh-CN";
  try {
    const raw = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (raw === "en" || raw === "zh-CN") return raw;
  } catch {
    /* ignore */
  }
  return "zh-CN";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => readStoredLocale());

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    if (typeof document !== "undefined") {
      document.documentElement.lang = next;
    }
  }, []);

  const value = useMemo<I18nValue>(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
    return {
      locale,
      setLocale,
      t: (key) => messages[locale][key] ?? messages.en[key] ?? key,
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className={`inline-flex items-center gap-1.5 text-[11px] text-neutral-500 ${className}`}>
      <span className="sr-only">{t("lang.label")}</span>
      <select
        aria-label={t("lang.label")}
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        className="rounded border border-neutral-200 bg-white px-1.5 py-1 text-[11px] text-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-300"
      >
        <option value="zh-CN">{t("lang.zh")}</option>
        <option value="en">{t("lang.en")}</option>
      </select>
    </label>
  );
}
