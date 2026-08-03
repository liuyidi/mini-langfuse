export type OrganizationMember = {
  user_id: string;
  email: string;
  name: string | null;
  role: string;
};

export type OrganizationProject = {
  id: string;
  name: string;
  org_id: string | null;
  created_at: string;
};

export type OrganizationDetail = {
  id: string;
  name: string;
  role: string;
  members: OrganizationMember[];
  projects: OrganizationProject[];
};

async function uiReq<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
  return res.json();
}

export const organizationsApi = {
  get: (orgId: string) => uiReq<OrganizationDetail>(`/api/ui/organizations/${orgId}`),
  update: (orgId: string, name: string) =>
    uiReq<{ id: string; name: string }>(`/api/ui/organizations/${orgId}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
  createProject: (orgId: string, name: string) =>
    uiReq<OrganizationProject>(`/api/ui/organizations/${orgId}/projects`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  updateProject: (projectId: string, name: string) =>
    uiReq<OrganizationProject>(`/api/ui/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
};
