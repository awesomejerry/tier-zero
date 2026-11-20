import { CATEGORIES, type SupportCase } from "@tier-zero/core";
import type { DatasetFile } from "./generate.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${path} must be a non-empty string`);
  }
  return value;
}

export function parseDataset(value: unknown): DatasetFile {
  if (!isRecord(value)) throw new Error("dataset must be an object");
  if (value.version !== 1) throw new Error("dataset version must be 1");
  if (value.synthetic !== true) throw new Error("dataset must be marked synthetic");
  if (!Array.isArray(value.cases)) throw new Error("dataset.cases must be an array");
  const cases = value.cases.map((entry, index) => parseCase(entry, index));
  return {
    version: 1,
    seed: typeof value.seed === "number" ? value.seed : 0,
    synthetic: true,
    description: typeof value.description === "string" ? value.description : "",
    cases,
  };
}

function parseCase(value: unknown, index: number): SupportCase {
  if (!isRecord(value)) throw new Error(`cases[${index}] must be an object`);
  const ticket = isRecord(value.ticket) ? value.ticket : {};
  const customer = isRecord(ticket.customer) ? ticket.customer : {};
  const label = isRecord(value.label) ? value.label : {};
  const generator = isRecord(value.generator) ? value.generator : {};
  const category = label.category;
  if (typeof category !== "string" || !(CATEGORIES as readonly string[]).includes(category)) {
    throw new Error(`cases[${index}].label.category is invalid`);
  }
  const order = value.order === null ? null : isRecord(value.order) ? value.order : null;
  if (value.order !== null && order === null) {
    throw new Error(`cases[${index}].order is invalid`);
  }
  const profile = isRecord(value.customer) ? value.customer : {};
  return {
    ticket: {
      id: expectString(ticket.id, `cases[${index}].ticket.id`),
      receivedAt: expectString(ticket.receivedAt, `cases[${index}].ticket.receivedAt`),
      channel: ticket.channel === "chat" || ticket.channel === "web" ? ticket.channel : "email",
      subject: expectString(ticket.subject, `cases[${index}].ticket.subject`),
      body: expectString(ticket.body, `cases[${index}].ticket.body`),
      customer: {
        name: expectString(customer.name, `cases[${index}].ticket.customer.name`),
        email: expectString(customer.email, `cases[${index}].ticket.customer.email`),
        plan: customer.plan === "free" || customer.plan === "enterprise" ? customer.plan : "pro",
      },
      orderId: typeof ticket.orderId === "string" ? ticket.orderId : null,
    },
    order:
      order === null
        ? null
        : {
            orderId: expectString(order.orderId, `cases[${index}].order.orderId`),
            product: expectString(order.product, `cases[${index}].order.product`),
            amountCents: typeof order.amountCents === "number" ? order.amountCents : 0,
            placedAt: expectString(order.placedAt, `cases[${index}].order.placedAt`),
            daysSincePurchase: typeof order.daysSincePurchase === "number" ? order.daysSincePurchase : 0,
            fulfillmentStatus:
              order.fulfillmentStatus === "delivered" ||
              order.fulfillmentStatus === "in_transit" ||
              order.fulfillmentStatus === "delayed" ||
              order.fulfillmentStatus === "lost" ||
              order.fulfillmentStatus === "digital" ||
              order.fulfillmentStatus === "none"
                ? order.fulfillmentStatus
                : "none",
            issueCategory:
              typeof order.issueCategory === "string" &&
              (CATEGORIES as readonly string[]).includes(order.issueCategory)
                ? (order.issueCategory as SupportCase["label"]["category"])
                : "other",
            duplicateCharge: order.duplicateCharge === true,
            refundEligible: order.refundEligible === true,
            crmAgreesWithLabel: order.crmAgreesWithLabel !== false,
          },
    customer: {
      email: expectString(profile.email, `cases[${index}].customer.email`),
      name: expectString(profile.name, `cases[${index}].customer.name`),
      plan: profile.plan === "free" || profile.plan === "enterprise" ? profile.plan : "pro",
      accountStatus:
        profile.accountStatus === "locked" || profile.accountStatus === "past_due"
          ? profile.accountStatus
          : "active",
      issueCategory:
        typeof profile.issueCategory === "string" &&
        (CATEGORIES as readonly string[]).includes(profile.issueCategory)
          ? (profile.issueCategory as SupportCase["label"]["category"])
          : "other",
    },
    label: {
      category: category as SupportCase["label"]["category"],
      severityIndex: typeof label.severityIndex === "number" ? label.severityIndex : 0,
      isHighStakes: label.isHighStakes === true,
      needsAccountLookup: label.needsAccountLookup === true,
      hasLegalThreat: label.hasLegalThreat === true,
    },
    generator: {
      cohort:
        generator.cohort === "borderline" ||
        generator.cohort === "confused" ||
        generator.cohort === "stakes"
          ? generator.cohort
          : "clear",
      scenarioId: typeof generator.scenarioId === "string" ? generator.scenarioId : "",
      confusedAs:
        typeof generator.confusedAs === "string" &&
        (CATEGORIES as readonly string[]).includes(generator.confusedAs)
          ? (generator.confusedAs as SupportCase["label"]["category"])
          : null,
      guaranteeDemand: generator.guaranteeDemand === true,
      overCapRefund: generator.overCapRefund === true,
    },
  };
}
