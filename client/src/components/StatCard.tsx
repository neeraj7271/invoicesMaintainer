import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  subtext,
  icon: Icon,
  tone = "neutral"
}: {
  label: string;
  value: string;
  subtext?: string;
  icon: LucideIcon;
  tone?: "neutral" | "green" | "amber" | "red";
}) {
  const toneClass = {
    neutral: "border-clearing text-clearing",
    green: "border-paid text-paid",
    amber: "border-marigold text-marigold",
    red: "border-overdue text-overdue"
  }[tone];

  return (
    <section className={`surface border-l-4 p-4 ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.06em] text-ledger-muted">
            {label}
          </p>
          <p className="mt-2 font-mono text-2xl font-semibold tracking-normal text-ledger">
            {value}
          </p>
          {subtext ? (
            <p className="mt-1 text-sm text-ledger-muted">{subtext}</p>
          ) : null}
        </div>
        <span className="border-l border-line pl-3">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
    </section>
  );
}
