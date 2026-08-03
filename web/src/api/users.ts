// Users analytics API client (M21)
import { getProjectAuthHeader } from "../lib/projectAuth";

async function userReq<T>(path: string): Promise<T> {
  const r = await fetch(path, {
    headers: {
      Authorization: getProjectAuthHeader(),
      "Content-Type": "application/json",
    },
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${await r.text()}`);
  return r.json();
}

function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined);
  return entries.length ? "?" + new URLSearchParams(entries as [string, string][]).toString() : "";
}

export type UserSummary = {
  user_id: string;
  trace_count: number;
  session_count: number;
  first_seen: string | null;
  last_seen: string | null;
  total_tokens: number;
  total_cost_usd: number;
};

export type UsersAnalyticsResponse = {
  period: { from: string; to: string };
  summary: {
    total_users: number;
    total_traces: number;
    total_sessions: number;
    avg_traces_per_user: number;
  };
  top_users: UserSummary[];
  daily_activity: {
    date: string;
    trace_count: number;
    active_users: number;
  }[];
};

export const usersApi = {
  list: (limit = 100) =>
    userReq<{ users: UserSummary[]; total: number }>(`/api/public/users?limit=${limit}`),

  getAnalytics: (from?: string, to?: string) =>
    userReq<UsersAnalyticsResponse>(
      `/api/public/users/analytics${qs({ fromTimestamp: from, toTimestamp: to })}`
    ),
};
