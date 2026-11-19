export function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function latency(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(2)}s`;
  return `${Math.round(value)}ms`;
}

export function dollars(value: number): string {
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(3)}`;
}

export function clock(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hourCycle: "h23",
  }).format(new Date(iso));
}

export function probability(value: number): string {
  return value.toFixed(2);
}

const SEVERITY = ["informational", "low", "medium", "high", "critical"];

export function severityName(score: number): string {
  const index = Math.max(0, Math.min(SEVERITY.length - 1, Math.round(score)));
  return SEVERITY[index] ?? "medium";
}
