import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";

type ApiKey = {
  id: string;
  public_key: string;
  note: string | null;
  last_used_at: string | null;
  created_at: string;
};

type CreatedKey = {
  id: string;
  public_key: string;
  secret: string;
  note: string | null;
};

export default function ApiKeysPage() {
  const { currentProject } = useAuth();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [note, setNote] = useState("");
  const [newKey, setNewKey] = useState<CreatedKey | null>(null);
  const [error, setError] = useState("");

  const projectId = currentProject?.id;

  const fetchKeys = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/ui/projects/${projectId}/api-keys`, {
        credentials: "include",
      });
      if (res.ok) {
        setKeys(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, [projectId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) return;

    setCreating(true);
    setError("");
    try {
      const res = await fetch(`/api/ui/projects/${projectId}/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ note: note || null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Failed to create key" }));
        throw new Error(err.detail);
      }
      const created: CreatedKey = await res.json();
      setNewKey(created);
      setNote("");
      await fetchKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create key");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (keyId: string) => {
    if (!projectId) return;
    if (!confirm("Are you sure? This key will be permanently revoked.")) return;

    try {
      const res = await fetch(`/api/ui/projects/${projectId}/api-keys/${keyId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        setKeys((prev) => prev.filter((k) => k.id !== keyId));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (!projectId) {
    return (
      <div className="p-6 text-neutral-500">No project selected</div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-6">API Keys</h1>
      <p className="text-sm text-neutral-500 mb-6">
        API keys are used to authenticate SDK requests. Each key consists of a public key (pk-...) and a secret (sk-...).
        <strong className="text-red-600"> The secret is only shown once at creation.</strong>
      </p>

      {/* New Key Created Alert */}
      {newKey && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <h3 className="font-medium text-green-800 mb-2">
            New API key created! Copy your secret now:
          </h3>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-white border border-green-300 rounded px-3 py-2 text-sm font-mono">
                {newKey.public_key}
              </code>
              <button
                onClick={() => copyToClipboard(newKey.public_key)}
                className="text-sm text-green-700 hover:underline"
              >
                Copy
              </button>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-white border border-green-300 rounded px-3 py-2 text-sm font-mono">
                {newKey.secret}
              </code>
              <button
                onClick={() => copyToClipboard(newKey.secret)}
                className="text-sm text-green-700 hover:underline"
              >
                Copy
              </button>
            </div>
          </div>
          <button
            onClick={() => setNewKey(null)}
            className="mt-3 text-sm text-green-700 hover:underline"
          >
            Dismiss (secret will not be shown again)
          </button>
        </div>
      )}

      {/* Create New Key Form */}
      <form onSubmit={handleCreate} className="bg-white border border-neutral-200 rounded-lg p-4 mb-6">
        <h2 className="font-medium mb-3">Create new API key</h2>
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 mb-3">
            {error}
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional) - e.g. 'Production SDK'"
            className="flex-1 rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={creating}
            className="bg-neutral-900 text-white rounded px-4 py-2 text-sm font-medium hover:bg-neutral-800 disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create"}
          </button>
        </div>
      </form>

      {/* Existing Keys */}
      <div className="bg-white border border-neutral-200 rounded-lg">
        <div className="px-4 py-3 border-b border-neutral-200">
          <h2 className="font-medium">Existing API keys</h2>
        </div>
        {loading ? (
          <div className="p-4 text-neutral-500">Loading...</div>
        ) : keys.length === 0 ? (
          <div className="p-4 text-neutral-500">No API keys yet. Create one above.</div>
        ) : (
          <ul className="divide-y divide-neutral-200">
            {keys.map((key) => (
              <li key={key.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <code className="text-sm font-mono text-neutral-700">
                    {key.public_key.substring(0, 20)}...
                  </code>
                  {key.note && (
                    <span className="ml-2 text-sm text-neutral-500">— {key.note}</span>
                  )}
                  <div className="text-xs text-neutral-400 mt-1">
                    Created: {new Date(key.created_at).toLocaleDateString()}
                    {key.last_used_at && (
                      <> · Last used: {new Date(key.last_used_at).toLocaleDateString()}</>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(key.id)}
                  className="text-sm text-red-600 hover:text-red-800"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
