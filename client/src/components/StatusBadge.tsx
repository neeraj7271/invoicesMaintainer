import { statusClass, statusLabel } from "../lib/format";

export function StatusBadge({ status }: { status: string }) {
  const markClass =
    status === "PAID"
      ? "bg-paid"
      : status === "OVERDUE"
        ? "bg-overdue"
        : status === "PARTIALLY_PAID"
          ? "bg-clearing"
          : "bg-marigold";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[4px] border px-2 py-1 text-xs font-semibold ${statusClass(
        status
      )}`}
    >
      <span className={`h-2 w-2 ${markClass}`} aria-hidden="true" />
      {statusLabel(status)}
    </span>
  );
}
