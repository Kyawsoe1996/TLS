"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

type Monthly = {
  month: string;
  revenue: number;
  newCustomers: number;
  returningCustomers: number;
};
type Campaign = { campaign: string; conversions: number };

export function AnalyticsCharts({
  monthly,
  campaigns,
}: {
  monthly: Monthly[];
  campaigns: Campaign[];
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-xl border border-white/10 p-4">
        <h2 className="mb-4 text-sm text-white/70">Revenue by month</h2>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={monthly}>
            <CartesianGrid strokeOpacity={0.1} />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Line type="monotone" dataKey="revenue" stroke="#fbbf24" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-xl border border-white/10 p-4">
        <h2 className="mb-4 text-sm text-white/70">New vs returning customers</h2>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={monthly}>
            <CartesianGrid strokeOpacity={0.1} />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="newCustomers" fill="#fbbf24" />
            <Bar dataKey="returningCustomers" fill="#60a5fa" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-xl border border-white/10 p-4 lg:col-span-2">
        <h2 className="mb-4 text-sm text-white/70">Conversions by campaign</h2>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={campaigns}>
            <CartesianGrid strokeOpacity={0.1} />
            <XAxis dataKey="campaign" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="conversions" fill="#34d399" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
