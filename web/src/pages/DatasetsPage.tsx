import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight, Plus } from "lucide-react";
import { datasetsApi, Dataset } from "../api/datasets";

export default function DatasetsPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const q = useQuery({
    queryKey: ["datasets"],
    queryFn: () => datasetsApi.list(),
  });

  const createMut = useMutation({
    mutationFn: (body: { name: string; description?: string }) => datasetsApi.create(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["datasets"] });
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => datasetsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["datasets"] }),
  });

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Datasets</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Manage test datasets for running experiments and comparing prompt versions.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="inline-flex items-center gap-1 bg-neutral-900 text-white rounded px-4 py-2 text-sm font-medium hover:bg-neutral-800"
        >
          {showCreate ? "Cancel" : (<><Plus className="h-3.5 w-3.5" /> New Dataset</>)}
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={(e) => { e.preventDefault(); if (newName) createMut.mutate({ name: newName, description: newDesc || undefined }); }}
          className="bg-white rounded-lg border border-neutral-200 p-4 mb-6"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Name *</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
                placeholder="e.g. Customer Q&A Test Set"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Description</label>
              <input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
                placeholder="Optional description"
              />
            </div>
          </div>
          <div className="flex justify-end mt-3">
            <button
              type="submit"
              disabled={!newName || createMut.isPending}
              className="inline-flex items-center gap-1 bg-neutral-900 text-white rounded px-4 py-2 text-sm font-medium hover:bg-neutral-800 disabled:opacity-50"
            >
              {createMut.isPending ? "Creating..." : (<><Plus className="h-3.5 w-3.5" /> Create Dataset</>)}
            </button>
          </div>
        </form>
      )}

      {q.isLoading && <div className="text-neutral-500">Loading...</div>}

      {q.data && q.data.length === 0 && !showCreate && (
        <div className="bg-white rounded-lg border border-neutral-200 p-10 text-center">
          <p className="text-neutral-500 mb-4">No datasets yet. Create one to start running experiments.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1 bg-neutral-900 text-white rounded px-4 py-2 text-sm font-medium hover:bg-neutral-800"
          >
            <Plus className="h-3.5 w-3.5" />
            Create Dataset
          </button>
        </div>
      )}

      {q.data && q.data.length > 0 && (
        <div className="space-y-3">
          {q.data.map((ds) => (
            <div key={ds.id} className="bg-white rounded-lg border border-neutral-200 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <Link to={`/datasets/${ds.id}`} className="font-medium text-blue-600 hover:underline">
                    {ds.name}
                  </Link>
                  {ds.description && (
                    <p className="text-sm text-neutral-500 mt-1">{ds.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-xs text-neutral-400">
                    <span>{ds.item_count} items</span>
                    <span>Created {new Date(ds.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    to={`/datasets/${ds.id}`}
                    className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                  >
                    Open
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                  <button
                    onClick={() => { if (confirm("Delete this dataset?")) deleteMut.mutate(ds.id); }}
                    className="text-sm text-red-600 hover:text-red-800"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
