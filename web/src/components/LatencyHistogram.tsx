import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { HistogramBucket } from "../api/dashboard";

type LatencyHistogramProps = {
  data: HistogramBucket[];
};

const COLORS = [
  "#22c55e", // green - fast
  "#22c55e",
  "#84cc16", // lime
  "#eab308", // yellow
  "#f97316", // orange
  "#ef4444", // red
  "#dc2626", // dark red - slow
];

export default function LatencyHistogram({ data }: LatencyHistogramProps) {
  if (!data.length || data.every((d) => d.count === 0)) {
    return (
      <div className="h-64 flex items-center justify-center text-neutral-400 text-sm">
        No latency data
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
        <XAxis
          dataKey="bucket"
          tick={{ fontSize: 10, fill: "#737373" }}
          axisLine={{ stroke: "#d4d4d4" }}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#737373" }}
          axisLine={{ stroke: "#d4d4d4" }}
          width={40}
        />
        <Tooltip
          formatter={(value: number) => [`${value} traces`, "Count"]}
          contentStyle={{
            fontSize: 12,
            borderRadius: 6,
            border: "1px solid #e5e5e5",
          }}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {data.map((_, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
