export function formatMoney(amount: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

export function dateInputValue(value?: string | Date) {
  const date = value ? new Date(value) : new Date();
  return date.toISOString().slice(0, 10);
}

export function statusLabel(status: string) {
  return status
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

export function statusClass(status: string) {
  switch (status) {
    case "PAID":
      return "bg-paid/10 text-paid border-paid/30";
    case "PARTIALLY_PAID":
      return "bg-clearing/10 text-clearing border-clearing/30";
    case "OVERDUE":
      return "bg-overdue/10 text-overdue border-overdue/30";
    default:
      return "bg-marigold/10 text-marigold border-marigold/30";
  }
}

export function daysBetween(from: Date, to: Date) {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

export function textareaTemplateHint() {
  return "{client_name}, {invoice_number}, {amount}, {due_date}, {workspace_name}";
}
