import { ReactNode } from "react";

type KpiCardProps = {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  trend?: "up" | "down" | "neutral";
};

export default function KpiCard({ title, value, subtitle, icon }: KpiCardProps) {
  return (
    <div className="bg-white rounded-lg border border-neutral-200 p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
          {title}
        </span>
        {icon && <span className="text-neutral-400">{icon}</span>}
      </div>
      <div className="text-2xl font-semibold text-neutral-900 tabular-nums">
        {value}
      </div>
      {subtitle && (
        <div className="text-xs text-neutral-400 mt-1">{subtitle}</div>
      )}
    </div>
  );
}
