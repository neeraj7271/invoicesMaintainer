import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  action
}: {
  icon: LucideIcon;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="surface flex min-h-40 flex-col items-center justify-center border-dashed p-8 text-center">
      <Icon className="h-8 w-8 text-clearing" aria-hidden="true" />
      <p className="mt-3 text-sm font-semibold text-ledger">{title}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
