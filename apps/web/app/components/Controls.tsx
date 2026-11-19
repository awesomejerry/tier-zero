import type { Metrics, SweepPoint } from "@tier-zero/core";
import { dollars, latency, percent } from "../lib/format";

function kneeCopy(tier: Metrics, baseline: Metrics): string {
  const gap = baseline.categoryAccuracy - tier.categoryAccuracy;
  const medianIsFast = tier.latencyMs.p50 < 1000;
  if (gap > 0.015 && medianIsFast) {
    return "Some uncertain tickets are still on the template path, so category accuracy is under the agent baseline. The median stays fast because most tickets never wait on the model.";
  }
  if (gap <= 0.015 && medianIsFast) {
    return "Accuracy has caught the scripted baseline, and the median ticket is still on the fast path. This is the knee. Drag right and latency jumps without buying accuracy.";
  }
  return "More than half the tickets now wait on the agent. Category accuracy is already at the baseline, so the extra seconds are spend.";
}

function Spark({
  points,
  read,
  marker,
  color,
}: {
  points: SweepPoint[];
  read: (point: SweepPoint) => number;
  marker: number;
  color: string;
}) {
  const values = points.map(read);
  const max = Math.max(...values, 0.001);
  const min = Math.min(...values);
  const span = max - min || 1;
  const width = 300;
  const height = 64;
  const coords = points.map((point, index) => {
    const x = 8 + (index / Math.max(1, points.length - 1)) * (width - 16);
    const y = 8 + (1 - ((values[index] ?? 0) - min) / span) * (height - 18);
    return { x, y, threshold: point.threshold };
  });
  const first = coords[0];
  if (!first) return null;
  const d = coords.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const at = coords.reduce((best, point) =>
    Math.abs(point.threshold - marker) < Math.abs(best.threshold - marker) ? point : best,
  );
  return (
    <svg className="spark" viewBox={`0 0 ${width} ${height}`} role="img">
      <path d={d} fill="none" stroke={color} strokeWidth="2" />
      <circle cx={at.x} cy={at.y} r="4" fill="#d6ff4a" />
    </svg>
  );
}

export function Controls({
  threshold,
  onThreshold,
  tier,
  baseline,
  sweep,
  showLabels,
  onShowLabels,
  onReplay,
  arrived,
  total,
}: {
  threshold: number;
  onThreshold: (value: number) => void;
  tier: Metrics;
  baseline: Metrics;
  sweep: SweepPoint[];
  showLabels: boolean;
  onShowLabels: (value: boolean) => void;
  onReplay: () => void;
  arrived: number;
  total: number;
}) {
  const fastShare = tier.ticketCount === 0 ? 0 : tier.fastPathCount / tier.ticketCount;
  return (
    <section className="pane" aria-label="Threshold and metrics">
      <div className="pane-head">
        <h2>Control</h2>
        <span className="badge">simulated</span>
      </div>
      <div className="scroll controls">
        <div>
          <div className="slider-row">
            <span className="muted">Confidence threshold</span>
            <span className="threshold">{threshold.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min={0.5}
            max={0.98}
            step={0.01}
            value={threshold}
            aria-valuemin={0.5}
            aria-valuemax={0.98}
            aria-valuenow={threshold}
            aria-label="Confidence threshold"
            onChange={(event) => onThreshold(Number(event.target.value))}
          />
          <p className="muted">
            Fast path when operational confidence is at least this high and both high-stakes and legal-threat probabilities are under 0.50. The safety gates do not move with the slider.
          </p>
        </div>

        <div>
          <div className="slider-row">
            <span className="muted">Fast path</span>
            <span className="mono">{percent(fastShare)}</span>
          </div>
          <div className="mix" aria-hidden="true">
            <span style={{ width: `${fastShare * 100}%` }} />
          </div>
        </div>

        <p className="knee">{kneeCopy(tier, baseline)}</p>

        <div className="stats">
          <div className="stat">
            <span>Category accuracy</span>
            <b>{percent(tier.categoryAccuracy)}</b>
            <span className="base muted">{percent(baseline.categoryAccuracy)}</span>
          </div>
          <div className="stat">
            <span>p50 latency</span>
            <b>{latency(tier.latencyMs.p50)}</b>
            <span className="base muted">{latency(baseline.latencyMs.p50)}</span>
          </div>
          <div className="stat">
            <span>p95 latency</span>
            <b>{latency(tier.latencyMs.p95)}</b>
            <span className="base muted">{latency(baseline.latencyMs.p95)}</span>
          </div>
          <div className="stat">
            <span>Cost / 1,000</span>
            <b>{dollars(tier.costPerThousandUsd)}</b>
            <span className="base muted">{dollars(baseline.costPerThousandUsd)}</span>
          </div>
          <div className="stat">
            <span>High-stakes recall</span>
            <b>{percent(tier.highStakesRecall)}</b>
            <span className="base muted">fixed gate</span>
          </div>
        </div>
        <p className="faint">Right-hand column is the LLM-only baseline: the same scripted agent on every ticket, with no System One triage. Both columns are mock numbers.</p>

        <div>
          <span className="muted">Accuracy across thresholds</span>
          <Spark points={sweep} read={(point) => point.tierZeroAccuracy} marker={threshold} color="#8fd0a4" />
          <span className="muted">p50 latency across thresholds</span>
          <Spark points={sweep} read={(point) => point.tierZeroP50Ms} marker={threshold} color="#e2b15a" />
        </div>

        <div className="filters" style={{ padding: 0 }}>
          <button className="chip" aria-pressed={showLabels} onClick={() => onShowLabels(!showLabels)}>
            {showLabels ? "Hide eval labels" : "Show eval labels"}
          </button>
          <button className="chip" onClick={onReplay}>Replay arrival</button>
        </div>
        <p className="faint">
          Metrics cover {arrived} of {total} seeded tickets.
          {" "}Mock latencies and scripted decisions. Not a measurement of OpenAI or TypeSafe.
          {" "}Portfolio demo for Harbor support. Unrelated to the AI-ops product named TierZero.
        </p>
      </div>
    </section>
  );
}
