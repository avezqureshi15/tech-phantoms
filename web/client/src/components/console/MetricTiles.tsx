import { CircleCheck, CirclePause, Clock, Ticket as TicketIcon } from "lucide-react";
import type { Metrics } from "@/lib/types";

const TILES = [
  { key: "ticketsToday", label: "Tickets today", Icon: TicketIcon },
  { key: "autoResolvedPct", label: "Auto-resolved", Icon: CircleCheck },
  { key: "awaitingApproval", label: "Awaiting approval", Icon: CirclePause },
  { key: "avgHandleTimeSeconds", label: "Avg handle time", Icon: Clock },
] as const;

function Tile({ label, value, Icon }: { label: string; value: string | number; Icon: typeof TicketIcon }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-tertiary">{label}</p>
        <span className="flex size-8 items-center justify-center rounded-xl bg-mint text-primary">
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-3 font-heading text-3xl leading-none font-medium tracking-tight text-ink tabular-nums">{value}</p>
    </div>
  );
}

/** Four metric tiles (§3.5 formulas). */
export function MetricTiles({ metrics }: { metrics: Metrics | null }) {
  const values: Record<(typeof TILES)[number]["key"], string | number> = {
    ticketsToday: metrics?.ticketsToday ?? "—",
    autoResolvedPct: metrics ? `${metrics.autoResolvedPct}%` : "—",
    awaitingApproval: metrics?.awaitingApproval ?? "—",
    avgHandleTimeSeconds: metrics ? `${metrics.avgHandleTimeSeconds}s` : "—",
  };

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {TILES.map(({ key, label, Icon }) => (
        <Tile key={key} label={label} value={values[key]} Icon={Icon} />
      ))}
    </div>
  );
}
