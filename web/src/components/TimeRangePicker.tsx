type TimeRange = {
  label: string;
  value: string;
  hours: number;
};

const RANGES: TimeRange[] = [
  { label: "1h", value: "1h", hours: 1 },
  { label: "24h", value: "24h", hours: 24 },
  { label: "7d", value: "7d", hours: 168 },
  { label: "30d", value: "30d", hours: 720 },
];

type TimeRangePickerProps = {
  value: string;
  onChange: (value: string) => void;
};

export default function TimeRangePicker({ value, onChange }: TimeRangePickerProps) {
  return (
    <div className="flex items-center gap-1 bg-neutral-100 rounded-lg p-0.5">
      {RANGES.map((r) => (
        <button
          key={r.value}
          onClick={() => onChange(r.value)}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
            value === r.value
              ? "bg-white text-neutral-900 shadow-sm"
              : "text-neutral-500 hover:text-neutral-700"
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

export function getTimeRangeTimestamps(range: string): { from: string; to: string } {
  const hours = RANGES.find((r) => r.value === range)?.hours ?? 24;
  const to = new Date();
  const from = new Date(to.getTime() - hours * 3600 * 1000);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}
