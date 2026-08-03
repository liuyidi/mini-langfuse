import { useEffect, useState } from "react";

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

export type PaginationBarProps = {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
  disabled?: boolean;
};

function clampPage(page: number, totalPages: number): number {
  if (totalPages < 1) return 1;
  return Math.min(Math.max(1, page), totalPages);
}

export default function PaginationBar({
  page,
  limit,
  total,
  onPageChange,
  onLimitChange,
  disabled = false,
}: PaginationBarProps) {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, limit)));
  const current = clampPage(page, totalPages);
  const [draftPage, setDraftPage] = useState(String(current));

  useEffect(() => {
    setDraftPage(String(current));
  }, [current]);

  const go = (next: number) => {
    const p = clampPage(next, totalPages);
    if (p !== page) onPageChange(p);
  };

  const commitDraft = () => {
    const parsed = Number.parseInt(draftPage, 10);
    if (Number.isNaN(parsed)) {
      setDraftPage(String(current));
      return;
    }
    go(parsed);
  };

  const btn =
    "inline-flex h-8 w-8 items-center justify-center rounded border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-neutral-200 bg-white px-4 py-2.5 text-sm text-neutral-800">
      <label className="inline-flex items-center gap-2 font-medium">
        <span>Rows per page</span>
        <select
          className="h-8 rounded border border-neutral-300 bg-white px-2 pr-7 text-sm font-normal outline-none focus:border-neutral-400"
          value={limit}
          disabled={disabled}
          onChange={(e) => onLimitChange(Number(e.target.value))}
        >
          {PAGE_SIZE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>

      <div className="inline-flex items-center gap-2">
        <span className="font-medium">Page</span>
        <input
          type="text"
          inputMode="numeric"
          className="h-8 w-12 rounded border border-neutral-300 bg-white px-2 text-center tabular-nums outline-none focus:border-neutral-400 disabled:opacity-40"
          value={draftPage}
          disabled={disabled || total === 0}
          onChange={(e) => setDraftPage(e.target.value.replace(/[^\d]/g, ""))}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
          aria-label="Current page"
        />
        <span className="text-neutral-600">of {total === 0 ? 0 : totalPages}</span>
      </div>

      <div className="ml-auto inline-flex items-center gap-1.5">
        <button
          type="button"
          className={btn}
          disabled={disabled || current <= 1}
          onClick={() => go(1)}
          aria-label="First page"
          title="First page"
        >
          «
        </button>
        <button
          type="button"
          className={btn}
          disabled={disabled || current <= 1}
          onClick={() => go(current - 1)}
          aria-label="Previous page"
          title="Previous page"
        >
          ‹
        </button>
        <button
          type="button"
          className={btn}
          disabled={disabled || current >= totalPages || total === 0}
          onClick={() => go(current + 1)}
          aria-label="Next page"
          title="Next page"
        >
          ›
        </button>
        <button
          type="button"
          className={btn}
          disabled={disabled || current >= totalPages || total === 0}
          onClick={() => go(totalPages)}
          aria-label="Last page"
          title="Last page"
        >
          »
        </button>
      </div>
    </div>
  );
}
