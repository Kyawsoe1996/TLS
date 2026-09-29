"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

// Each metric is shown as an index where the industry average = 100,
// so revenue / orders / retention are comparable on one axis.
export function BenchmarkChart({
  data,
}: {
  data: { metric: string; you: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data}>
        <CartesianGrid strokeOpacity={0.1} />
        <XAxis dataKey="metric" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend />
        <ReferenceLine y={100} stroke="#60a5fa" strokeDasharray="4 4" />
        <Bar dataKey="you" name="You (industry avg = 100)" fill="#fbbf24" />
      </BarChart>
    </ResponsiveContainer>
  );
}
