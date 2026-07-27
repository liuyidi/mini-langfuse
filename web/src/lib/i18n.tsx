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
