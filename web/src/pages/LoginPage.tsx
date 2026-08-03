import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { useAuth } from "../lib/auth";
import { LanguageSwitcher, useI18n } from "../lib/i18n";

export default function LoginPage() {
  const { login } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("login.failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950">
      <div className="w-full max-w-sm">
        <div className="flex justify-end mb-2">
          <LanguageSwitcher />
        </div>
        <div className="text-center mb-8">
          <h1 className="flex items-center justify-center gap-2 text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            <Sparkles className="h-6 w-6 text-amber-500" />
            Mini Langfuse
          </h1>
          <p className="text-sm text-neutral-500 mt-2 dark:text-neutral-400">{t("login.title")}</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-neutral-200 p-6 space-y-4 dark:bg-neutral-900 dark:border-neutral-800">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 dark:bg-red-950/40 dark:border-red-900/40 dark:text-red-200">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1 dark:text-neutral-200">
              {t("login.email")}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50 dark:focus:ring-blue-400"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1 dark:text-neutral-200">
              {t("login.password")}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50 dark:focus:ring-blue-400"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-neutral-900 text-white rounded px-4 py-2 text-sm font-medium hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-neutral-50 dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            {loading ? t("login.submitting") : t("login.submit")}
          </button>

          <p className="text-sm text-neutral-500 text-center dark:text-neutral-400">
            {t("login.noAccount")}{" "}
            <Link to="/register" className="text-blue-600 hover:underline">
              {t("login.register")}
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
