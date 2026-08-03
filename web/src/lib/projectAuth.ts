const ACTIVE_PROJECT_STORAGE_KEY = "mlf.activeProjectId";
const PROJECT_CREDENTIALS_PREFIX = "mlf.projectApiCredentials.";

const DEMO_PROJECT_ID = "proj_demo";
const DEMO_PUBLIC_KEY = "pk-lf-demo";
const DEMO_SECRET_KEY = "sk-lf-demo";

export type ProjectApiCredentials = {
  publicKey: string;
  secret: string;
};

function storageAvailable() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function demoAuthHeader() {
  return `Basic ${btoa(`${DEMO_PUBLIC_KEY}:${DEMO_SECRET_KEY}`)}`;
}

export function getActiveProjectId(): string | null {
  if (!storageAvailable()) return null;
  return window.localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY);
}

export function setActiveProjectId(projectId: string) {
  if (!storageAvailable()) return;
  window.localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, projectId);
}

export function clearActiveProjectId() {
  if (!storageAvailable()) return;
  window.localStorage.removeItem(ACTIVE_PROJECT_STORAGE_KEY);
}

export function getProjectCredentials(projectId: string): ProjectApiCredentials | null {
  if (!storageAvailable()) return null;
  try {
    const raw = window.localStorage.getItem(`${PROJECT_CREDENTIALS_PREFIX}${projectId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProjectApiCredentials;
    if (!parsed?.publicKey || !parsed?.secret) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setProjectCredentials(projectId: string, credentials: ProjectApiCredentials) {
  if (!storageAvailable()) return;
  window.localStorage.setItem(
    `${PROJECT_CREDENTIALS_PREFIX}${projectId}`,
    JSON.stringify(credentials),
  );
}

export function clearProjectCredentials(projectId: string) {
  if (!storageAvailable()) return;
  window.localStorage.removeItem(`${PROJECT_CREDENTIALS_PREFIX}${projectId}`);
}

export function getProjectAuthHeader(projectId?: string | null): string {
  const activeProjectId = projectId ?? getActiveProjectId();
  if (!activeProjectId) {
    return demoAuthHeader();
  }

  if (activeProjectId === DEMO_PROJECT_ID) {
    return demoAuthHeader();
  }

  const credentials = getProjectCredentials(activeProjectId);
  if (!credentials) {
    throw new Error(`No API key configured for project ${activeProjectId}. Create one in Settings > API Keys.`);
  }

  return `Basic ${btoa(`${credentials.publicKey}:${credentials.secret}`)}`;
}

export function isDemoProject(projectId?: string | null) {
  return projectId === DEMO_PROJECT_ID;
}
