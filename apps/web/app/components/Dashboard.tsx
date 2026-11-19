"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  evaluatePrepared,
  prepareCases,
  sweepThresholds,
  type EvaluatedCase,
  type PreparedCase,
  type SweepPoint,
} from "@tier-zero/core";
import { cases } from "@tier-zero/dataset";
import { MockSystemOneProvider, MockSystemTwoProvider } from "@tier-zero/providers";
import { Controls } from "./Controls";
import { Detail } from "./Detail";
import { Inbox } from "./Inbox";

const SPARK_THRESHOLDS = Array.from({ length: 25 }, (_, index) =>
  Number((0.5 + index * 0.02).toFixed(2)),
);

export function Dashboard() {
  const [prepared, setPrepared] = useState<PreparedCase[] | null>(null);
  const [threshold, setThreshold] = useState(0.8);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "fast" | "slow" | "blocked">("all");
  const [query, setQuery] = useState("");
  const [showLabels, setShowLabels] = useState(false);
  const [revealed, setRevealed] = useState(cases.length);
  const replayTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const systemOne = new MockSystemOneProvider();
    const systemTwo = new MockSystemTwoProvider();
    void prepareCases(cases, systemOne, systemTwo).then((next) => {
      if (cancelled) return;
      setPrepared(next);
      const initial = evaluatePrepared(next, 0.8);
      const interesting =
        initial.cases.find((item) => item.tierZero.blocked) ?? initial.cases[0];
      setSelectedId(interesting?.prepared.supportCase.ticket.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (replayTimer.current !== null) window.clearInterval(replayTimer.current);
    };
  }, []);

  const comparison = useMemo(
    () =>
      prepared && revealed > 0 ? evaluatePrepared(prepared.slice(0, revealed), threshold) : null,
    [prepared, revealed, threshold],
  );
  const sweep = useMemo<SweepPoint[]>(
    () => (prepared ? sweepThresholds(prepared, SPARK_THRESHOLDS) : []),
    [prepared],
  );
  const selected: EvaluatedCase | null =
    comparison?.cases.find((item) => item.prepared.supportCase.ticket.id === selectedId) ??
    comparison?.cases[0] ??
    null;

  function replay() {
    if (replayTimer.current !== null) window.clearInterval(replayTimer.current);
    setRevealed(12);
    replayTimer.current = window.setInterval(() => {
      setRevealed((count) => {
        if (count >= cases.length) {
          if (replayTimer.current !== null) window.clearInterval(replayTimer.current);
          replayTimer.current = null;
          return cases.length;
        }
        return Math.min(cases.length, count + 8);
      });
    }, 50);
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="wordmark">Tier Zero</div>
          <div className="tagline">Fast-and-slow support triage for the Harbor inbox</div>
        </div>
        <div className="top-meta">
          <span className="badge live">mock mode</span>
          <span className="badge">gpt-6-luna decisions · gpt-6.2-sol agent</span>
          <span className="badge">{prepared ? `${revealed} tickets` : "scoring"}</span>
        </div>
      </header>
      {!comparison ? (
        <p className="loading">Scoring 300 seeded tickets with the mock System One…</p>
      ) : (
        <div className="columns">
          <Inbox
            cases={comparison.cases}
            selectedId={selected?.prepared.supportCase.ticket.id ?? null}
            onSelect={setSelectedId}
            filter={filter}
            onFilter={setFilter}
            query={query}
            onQuery={setQuery}
            showLabels={showLabels}
          />
          <Detail item={selected} showLabels={showLabels} />
          <Controls
            threshold={threshold}
            onThreshold={setThreshold}
            tier={comparison.tierZero}
            baseline={comparison.llmOnly}
            sweep={sweep}
            showLabels={showLabels}
            onShowLabels={setShowLabels}
            onReplay={replay}
            arrived={revealed}
            total={cases.length}
          />
        </div>
      )}
    </main>
  );
}
