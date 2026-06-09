export function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

export function fmtMoney(n: number) {
  return `$${fmt(n)}`;
}

/** Parse UTC ISO from API and show in the user's local timezone. */
export function fmtWhen(iso: string): string {
  const utc = iso.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(iso) ? iso : `${iso}Z`;
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(utc));
}

export function brokerMargin(loadboard: number, agreed: number): number {
  return Math.max(loadboard - agreed, 0);
}
