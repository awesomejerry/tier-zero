/** FNV-1a, stable across processes. Used only to spread simulated latency. */
export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function unitInterval(seed: string): number {
  return (hashString(seed) % 10_000) / 10_000;
}

/**
 * Simulated Decisions latency. Most calls land between 80ms and 180ms,
 * with a thin tail out to about 350ms. These are not measurements.
 */
export function simulatedDecisionLatency(seed: string): number {
  const u = unitInterval(`decision:${seed}`);
  if (u < 0.92) return Math.round(78 + u * 110);
  return Math.round(190 + (u - 0.92) * 2000);
}

/**
 * Simulated Responses latency for one agent turn, in milliseconds.
 * The body sits around 1.5s to 3s, with a tail for longer generations.
 */
export function simulatedAgentLatency(seed: string): number {
  const u = unitInterval(`agent:${seed}`);
  if (u < 0.9) return Math.round(1450 + u * 1700);
  return Math.round(3100 + (u - 0.9) * 9000);
}
