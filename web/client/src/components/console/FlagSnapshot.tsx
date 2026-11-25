/** The flag snapshot from the decisive AgentAction, as a key/value table (§3.5) — proof of "why did it refund that?". */
export function FlagSnapshot({ snapshot }: { snapshot: Record<string, unknown> | null }) {
  if (!snapshot) {
    return <p className="rounded-2xl border border-border bg-card px-5 py-4 text-sm text-tertiary shadow-sm">No decisive action yet.</p>;
  }

  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-2xl border border-border bg-card p-5 text-sm shadow-sm">
      {Object.entries(snapshot).map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="font-mono text-tertiary">{key}</dt>
          <dd className="font-mono text-ink">{String(value)}</dd>
        </div>
      ))}
    </dl>
  );
}
