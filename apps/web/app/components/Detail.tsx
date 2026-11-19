import type { EvaluatedCase, TraceEvent } from "@tier-zero/core";
import { clock, probability, severityName } from "../lib/format";

function Bars({
  rows,
  tone,
}: {
  rows: { label: string; value: number }[];
  tone?: "slow" | "block";
}) {
  return (
    <div className="bars">
      {rows.map((row) => (
        <div className="bar-row" key={row.label}>
          <span>{row.label}</span>
          <span className="bar" aria-hidden="true">
            <span className={tone} style={{ width: `${Math.round(row.value * 100)}%` }} />
          </span>
          <span className="mono muted">{probability(row.value)}</span>
        </div>
      ))}
    </div>
  );
}

function Trace({ events }: { events: TraceEvent[] }) {
  return (
    <div className="trace">
      {events.map((event, index) => (
        <article
          key={`${event.type}-${index}`}
          className={`event ${event.verdict === "block" ? "block" : ""}`}
        >
          <header>
            <strong>
              {event.type === "reasoning"
                ? "Reasoning"
                : event.type === "tool_call"
                  ? event.name
                  : "Draft reply"}
            </strong>
            {event.verdict ? <span className={`pill ${event.verdict === "block" ? "block" : "fast"}`}>{event.verdict}</span> : null}
          </header>
          <p style={{ margin: 0 }}>{event.text}</p>
          {event.reasons && event.reasons.length > 0 ? (
            <p className="muted" style={{ margin: "4px 0 0" }}>
              {event.reasons.join(", ")}
            </p>
          ) : null}
          {event.checks ? (
            <div className="checks">
              {event.checks.map((check) => (
                <span key={check.name}>
                  {check.name} {check.probability.toFixed(2)}
                </span>
              ))}
            </div>
          ) : null}
          {event.arguments && event.type !== "reply" ? (
            <pre>{JSON.stringify(event.arguments, null, 2)}</pre>
          ) : null}
          {event.output ? <pre>{event.output}</pre> : null}
        </article>
      ))}
    </div>
  );
}

export function Detail({ item, showLabels }: { item: EvaluatedCase | null; showLabels: boolean }) {
  if (!item) return <section className="pane"><p className="empty">Select a ticket.</p></section>;
  const ticket = item.prepared.supportCase.ticket;
  const readout = item.route.readout;
  const label = item.prepared.supportCase.label;
  const categories = [...readout.categoryProbabilities].sort((a, b) => b.probability - a.probability);
  const slow = item.prepared.slow;
  const blocks = slow.trace.filter((event) => event.verdict === "block");

  return (
    <section className="pane" aria-label="Ticket detail">
      <div className="scroll detail">
        <div>
          <p className="mono muted" style={{ margin: "0 0 6px" }}>
            {ticket.id} · {ticket.channel} · {ticket.customer.plan} · {clock(ticket.receivedAt)}
          </p>
          <h1 className="ticket-title">{ticket.subject}</h1>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            {ticket.customer.name} · {ticket.customer.email}
            {ticket.orderId ? ` · ${ticket.orderId}` : ""}
          </p>
        </div>
        <p className="body">{ticket.body}</p>

        <section>
          <h3>System One</h3>
          <p className="mono" style={{ marginTop: 0 }}>
            Operational confidence {readout.operationalConfidence.toFixed(2)}
            {" · "}
            path {item.route.path}
          </p>
          {item.route.reasons.length > 0 ? (
            <div className="reasons">
              {item.route.reasons.map((reason) => (
                <span key={reason} className="pill slow">
                  {reason === "low_confidence" ? "below threshold" : reason.replaceAll("_", " ")}
                </span>
              ))}
            </div>
          ) : (
            <span className="pill fast">confident and not high stakes</span>
          )}
          <div className="split">
            <Bars rows={categories.map((entry) => ({ label: entry.value, value: entry.probability }))} />
            <div>
              <p className="muted" style={{ marginTop: 0 }}>
                Severity {readout.severityScore === null ? "—" : readout.severityScore.toFixed(2)}{" "}
                {readout.severityScore === null ? "" : severityName(readout.severityScore)}
                {" · "}confidence {readout.severityConfidence.toFixed(2)}
              </p>
              <Bars
                tone="slow"
                rows={[
                  { label: "high stakes", value: readout.isHighStakes ?? 0 },
                  { label: "legal threat", value: readout.hasLegalThreat ?? 0 },
                  { label: "needs lookup", value: readout.needsAccountLookup ?? 0 },
                ]}
              />
            </div>
          </div>
          {showLabels ? (
            <p className="mono muted">
              Eval label {label.category}, severity {label.severityIndex}
              {label.isHighStakes ? ", high stakes" : ""}
              {item.predictedCategory === label.category ? " · category match" : " · category miss"}
            </p>
          ) : null}
        </section>

        <section>
          <h3>{item.route.path === "fast" ? "Fast path" : "System Two"}</h3>
          {item.route.path === "slow" && blocks.length > 0 ? (
            <div className="callout">
              Guardrail blocked{" "}
              {blocks
                .map((event) =>
                  !event.name || event.name === "propose_resolution" ? "a draft reply" : event.name,
                )
                .filter((name, index, all) => all.indexOf(name) === index)
                .join(" and ")}
              :{" "}
              {blocks
                .flatMap((event) => event.reasons ?? [])
                .filter((reason, index, all) => all.indexOf(reason) === index)
                .map((reason) => reason.replaceAll("_", " "))
                .join(", ")}
              . The blocked action did not run.
            </div>
          ) : null}
          <p className="muted" style={{ marginTop: 0 }}>
            Queue {item.queue} · priority {item.priority}
            {item.route.path === "slow" && slow.escalated ? " · escalated" : ""}
            {slow.refundedCents !== null && item.route.path === "slow"
              ? ` · refunded $${(slow.refundedCents / 100).toFixed(2)}`
              : ""}
          </p>
          {item.route.path === "slow" ? <Trace events={slow.trace} /> : null}
          <p className={`reply ${item.route.path}`}>{item.reply}</p>
        </section>

        {item.route.path === "slow" ? null : (
          <details>
            <summary>Slow-path trace, not used at this threshold</summary>
            <p className="muted">
              System Two was not called. This is the trace it would have produced if the ticket had been escalated.
            </p>
            <Trace events={slow.trace} />
          </details>
        )}
      </div>
    </section>
  );
}
