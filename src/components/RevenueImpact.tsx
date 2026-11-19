"use client";

import { Clock, SlidersHorizontal, TrendingUp } from "lucide-react";
import { useState } from "react";
import { revenueImpact } from "@/lib/revenue";
import { fmtMoney, fmtUsd, useStore } from "@/lib/store";
import { Card, inputCls } from "./ui";

export function RevenueImpact() {
  const { prospects, posts, usage, assumptions, setAssumptions } = useStore();
  const [edit, setEdit] = useState(false);
  const r = revenueImpact(prospects, posts, usage, assumptions);
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const roi = r.roi >= 1000 ? `${Math.round(r.roi).toLocaleString()}×` : r.roi > 0 ? `${r.roi.toFixed(0)}×` : "—";

  return (
    <Card
      title={<span className="flex items-center gap-1.5"><TrendingUp className="h-4 w-4 text-emerald-600" /> Revenue impact</span>}
      subtitle="Projected from approved outreach × intent-based win probability. Estimates, not booked revenue."
      action={<button onClick={() => setEdit(!edit)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"><SlidersHorizontal className="h-3.5 w-3.5" /> Assumptions</button>}
    >
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Metric label="Pipeline engaged" value={fmtMoney(r.pipeline)} hint={`${r.engaged} approved outreach`} />
        <Metric label="Projected revenue" value={fmtMoney(r.expected)} hint={r.pendingExpected > 0 ? `+${fmtMoney(r.pendingExpected)} waiting for approval` : "from approved outreach"} accent />
        <Metric label="Owner time saved" value={`${r.hoursSaved.toFixed(1)} h`} hint={`≈ ${fmtMoney(r.timeValue)} at $${assumptions.hourlyRate}/h`} icon={<Clock className="h-3.5 w-3.5" />} />
        <Metric label="Return on AI spend" value={roi} hint={`(revenue + time) ÷ ${fmtUsd(r.aiCost)} AI`} />
      </div>
      {edit && (
        <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 md:grid-cols-4">
          {([
            ["replyRate", "Reply rate @ score 50", 0.01],
            ["meetingRate", "Reply → meeting", 0.05],
            ["closeRate", "Meeting → close", 0.05],
            ["hourlyRate", "Your hourly value ($)", 5],
          ] as const).map(([k, label, step]) => (
            <label key={k} className="text-[11px] font-medium text-slate-600">
              {label}
              <input type="number" step={step} min={0} max={k === "hourlyRate" ? 1000 : 1} className={`${inputCls} mt-1`} value={assumptions[k]} onChange={(e) => setAssumptions({ ...assumptions, [k]: Math.max(0, Number(e.target.value) || 0) })} />
            </label>
          ))}
          <p className="col-span-full text-[11px] text-slate-500">Win probability = min(90%, reply × score/50) × meeting × close. Currently a score-80 lead ≈ {pct(Math.min(0.9, assumptions.replyRate * 1.6) * assumptions.meetingRate * assumptions.closeRate)}.</p>
        </div>
      )}
    </Card>
  );
}

function Metric({ label, value, hint, accent, icon }: { label: string; value: string; hint: string; accent?: boolean; icon?: React.ReactNode }) {
  return (
    <div className={accent ? "rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-100" : "rounded-xl bg-slate-50 p-3"}>
      <div className="flex items-center gap-1 text-[11px] font-medium text-slate-500">{icon}{label}</div>
      <div className={`mt-1 text-xl font-semibold tracking-tight ${accent ? "text-emerald-700" : "text-slate-900"}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-slate-500">{hint}</div>
    </div>
  );
}
