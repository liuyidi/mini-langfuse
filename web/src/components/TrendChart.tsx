import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TimeseriesBucket } from "../api/dashboard";

type TrendChartProps = {
  data: TimeseriesBucket[];
  metric: string;
};

function formatValue(value: number, metric: string): string {
  switch (metric) {
    case "cost":
      return `$${value.toFixed(4)}`;
    case "tokens":
      return value.toLocaleString();
    case "traces":
      return String(Math.round(value));
    case "latency":
      return `${Math.round(value)}ms`;
    default:
      return String(value);
  }
}

function formatTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function TrendChart({ data, metric }: TrendChartProps) {
  if (!data.length) {
    return (
      <div className="h-64 flex items-center justify-center text-neutral-400 text-sm">
        No data for this time range
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
        <XAxis
          dataKey="timestamp"
          tickFormatter={formatTime}
          tick={{ fontSize: 11, fill: "#737373" }}
          axisLine={{ stroke: "#d4d4d4" }}
        />
        <YAxis
          tickFormatter={(v) => formatValue(v, metric)}
          tick={{ fontSize: 11, fill: "#737373" }}
          axisLine={{ stroke: "#d4d4d4" }}
          width={80}
        />
        <Tooltip
          labelFormatter={formatTime}
          formatter={(value: number) => [formatValue(value, metric), metric]}
          contentStyle={{
            fontSize: 12,
            borderRadius: 6,
            border: "1px solid #e5e5e5",
          }}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: "#3b82f6" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
