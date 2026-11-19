import type { EvaluatedCase } from "@tier-zero/core";

export function Inbox({
  cases,
  selectedId,
  onSelect,
  filter,
  onFilter,
  query,
  onQuery,
  showLabels,
}: {
  cases: EvaluatedCase[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  filter: "all" | "fast" | "slow" | "blocked";
  onFilter: (filter: "all" | "fast" | "slow" | "blocked") => void;
  query: string;
  onQuery: (query: string) => void;
  showLabels: boolean;
}) {
  const needle = query.trim().toLowerCase();
  const visible = cases.filter((item) => {
    if (filter === "fast" && item.route.path !== "fast") return false;
    if (filter === "slow" && item.route.path !== "slow") return false;
    if (filter === "blocked" && !item.tierZero.blocked) return false;
    if (!needle) return true;
    const ticket = item.prepared.supportCase.ticket;
    return (
      ticket.subject.toLowerCase().includes(needle) ||
      ticket.id.toLowerCase().includes(needle) ||
      ticket.customer.name.toLowerCase().includes(needle)
    );
  });

  return (
    <section className="pane" aria-label="Ticket stream">
      <div className="pane-head">
        <h2>Inbox</h2>
        <span className="mono muted">{visible.length}</span>
      </div>
      <div className="filters">
        {(["all", "fast", "slow", "blocked"] as const).map((name) => (
          <button
            key={name}
            className="chip"
            aria-pressed={filter === name}
            onClick={() => onFilter(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <input
        className="search"
        value={query}
        placeholder="Search subject, id, customer"
        aria-label="Search tickets"
        onChange={(event) => onQuery(event.target.value)}
      />
      <div className="scroll">
        {visible.length === 0 ? <p className="empty">No tickets in this view.</p> : null}
        {visible.map((item) => {
          const ticket = item.prepared.supportCase.ticket;
          const missed =
            showLabels && item.predictedCategory !== item.prepared.supportCase.label.category;
          return (
            <button
              key={ticket.id}
              className={`ticket ${item.route.path} ${selectedId === ticket.id ? "selected" : ""}`}
              onClick={() => onSelect(ticket.id)}
            >
              <span className="ticket-top">
                <span className="mono faint">{ticket.id}</span>
                <span className="ticket-top" style={{ gap: 4 }}>
                  {item.tierZero.blocked ? <span className="pill block">blocked</span> : null}
                  <span className={`pill ${item.route.path}`}>{item.route.path}</span>
                </span>
              </span>
              <span className="subject">{ticket.subject}</span>
              <span className="ticket-sub muted">
                <span>{ticket.customer.name}</span>
                <span className="mono">
                  {item.predictedCategory}
                  {missed ? " · miss" : ""}
                  {" · "}
                  {item.route.confidence.toFixed(2)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
