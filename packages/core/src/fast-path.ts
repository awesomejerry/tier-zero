import type { Category, Ticket } from "./types.js";
import type { TriageReadout } from "./router.js";

const QUEUE: Record<Category, string> = {
  billing: "billing",
  shipping: "fulfillment",
  technical: "technical",
  account: "account",
  returns: "returns",
  other: "general",
};

function priorityFor(score: number): "low" | "normal" | "high" | "urgent" {
  if (score < 1.5) return "low";
  if (score < 2.5) return "normal";
  if (score < 3.5) return "high";
  return "urgent";
}

function firstName(name: string): string {
  return name.split(" ")[0] || name;
}

/**
 * Pre-approved copy. The fast path does not call a model and does not promise
 * a refund, a credit, or a guarantee. A person still owns anything irreversible.
 */
export function fastPathResolution(ticket: Ticket, readout: TriageReadout): {
  category: Category;
  queue: string;
  priority: "low" | "normal" | "high" | "urgent";
  tags: string[];
  reply: string;
} {
  const category = readout.category ?? "other";
  const score = readout.severityScore ?? 1;
  const name = firstName(ticket.customer.name);
  const queue = QUEUE[category];
  const priority = priorityFor(score);
  const order = ticket.orderId ? ` I can see order ${ticket.orderId} on the ticket.` : "";

  const replies: Record<Category, string> = {
    billing: `Hi ${name}, thanks for writing about billing. I've tagged this for the billing queue and a specialist will confirm next steps.${order} You don't need to send the receipt again unless they ask.`,
    shipping: `Hi ${name}, thanks for the delivery note. I've routed this to fulfillment so someone can check the shipment.${order} I'll make sure the queue has your message.`,
    technical: `Hi ${name}, I've logged this for the technical queue with the details you sent. A specialist will follow up on the product issue. You don't need to reinstall anything in the meantime.`,
    account: `Hi ${name}, I've routed this to the account queue. For your security, password and access changes are confirmed by a specialist rather than from this automatic reply.`,
    returns: `Hi ${name}, I've tagged this for the returns queue so they can send the next step for the exchange. Please hold off on shipping the item back until they reply.`,
    other: `Hi ${name}, thanks for the note. I've placed it with the general queue and someone on Harbor support will follow up if a reply is needed.`,
  };

  return {
    category,
    queue,
    priority,
    tags: [category, `priority:${priority}`, "path:fast"],
    reply: replies[category],
  };
}
