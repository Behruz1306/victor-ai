"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useT } from "@/components/providers";

export type DailyRate = { day: string; approved: number; edited: number; rate: number | null };

/** Last N days, one point per day with decisions; days without decisions stay empty (no fake zeros). */
export function fillDays(
  daily: DailyRate[],
  days: number,
  now = new Date(),
): (DailyRate & { label: string })[] {
  const byDay = new Map(daily.map((d) => [d.day, d]));
  const out: (DailyRate & { label: string })[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    const hit = byDay.get(key);
    out.push({
      day: key,
      label: key.slice(5).replace("-", "/"),
      approved: hit?.approved ?? 0,
      edited: hit?.edited ?? 0,
      rate: hit?.rate ?? null,
    });
  }
  // Include days reported in company time that fall outside the UTC window.
  for (const d of daily)
    if (!out.some((o) => o.day === d.day))
      out.push({ ...d, label: d.day.slice(5).replace("-", "/") });
  return out.sort((a, b) => a.day.localeCompare(b.day)).slice(-days);
}

export function EditRateChart({ daily }: { daily: DailyRate[] }) {
  const { t } = useT();
  const data = fillDays(daily, 14);
  return (
    <div className="h-44 w-full" role="img" aria-label={t("pb.chart")}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={16}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 50, 100]}
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={44}
          />
          <Tooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1, strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              const p =
                active && payload?.[0]
                  ? (payload[0].payload as DailyRate & { label: string })
                  : null;
              if (!p) return null;
              return (
                <div className="rounded-md border bg-card px-2.5 py-1.5 text-xs shadow-md">
                  <div className="font-medium">{p.day}</div>
                  <div className="text-muted-foreground">
                    {p.rate == null
                      ? t("pb.noDecisions")
                      : `${t("pb.editRate")}: ${p.rate}% · ${p.edited}/${p.approved + p.edited}`}
                  </div>
                </div>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="rate"
            stroke="var(--primary)"
            strokeWidth={2}
            dot={{ r: 4, strokeWidth: 2, stroke: "var(--card)", fill: "var(--primary)" }}
            activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--card)" }}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
