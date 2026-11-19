import type {
  Category,
  Channel,
  Cohort,
  CustomerRecord,
  OrderRecord,
  Plan,
  SupportCase,
  Ticket,
} from "@tier-zero/core";

export const DATASET_SEED = 20261119;

export interface DatasetFile {
  version: 1;
  seed: number;
  synthetic: true;
  description: string;
  cases: SupportCase[];
}

interface Variant {
  subject: string;
  body: string;
}

interface Spec {
  id: string;
  count: number;
  cohort: Cohort;
  category: Category;
  confusedAs: Category | null;
  severityIndex: number;
  highStakes: boolean;
  legal: boolean;
  needsAccountLookup: boolean;
  guaranteeDemand: boolean;
  overCapRefund: boolean;
  noOrder: boolean;
  duplicateCharge: boolean;
  refundEligible: boolean;
  staleCrm: number;
  amounts: number[];
  fulfillment: OrderRecord["fulfillmentStatus"];
  accountStatus: CustomerRecord["accountStatus"];
  plan: Plan;
  variants: Variant[];
}

const FIRST = [
  "Ada", "Noah", "Mia", "Leo", "Ava", "Omar", "Priya", "Jonah", "Elena", "Hugo",
  "Nora", "Felix", "Amina", "Isaac", "Chloe", "Mateo", "Hana", "Arthur", "Leila", "Owen",
  "Sofia", "Miles", "Ines", "Theo", "Yara", "Naomi", "Rohan", "Clara", "Julian", "Esme",
];

const LAST = [
  "Nguyen", "Patel", "Garcia", "Cohen", "Sato", "Rossi", "Keller", "Ibrahim", "Silva", "Berg",
  "Nowak", "Diallo", "Hansen", "Okoye", "Moreau",
];

const PRODUCTS = [
  "Cedar kettle", "Linen apron", "Stoneware mug", "Wool throw", "Brass lamp",
  "Cotton sheet", "Oak tray", "Ceramic bowl", "Harbor Plus plan", "Seller notes add-on",
];

const NEUTRAL = [
  "This started on Tuesday.",
  "I am writing from my phone.",
  "Happy to talk this afternoon if that helps.",
  "Thanks for taking a look.",
];

const CHANNELS: Channel[] = ["email", "chat", "web"];

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, values: readonly T[]): T {
  const index = Math.min(values.length - 1, Math.floor(rng() * values.length));
  const value = values[index];
  if (value === undefined) throw new Error("empty pick");
  return value;
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? `{${key}}`);
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const SPECS: Spec[] = [
  {
    id: "billing-subscription",
    count: 28,
    cohort: "clear",
    category: "billing",
    confusedAs: null,
    severityIndex: 2,
    highStakes: false,
    legal: false,
    needsAccountLookup: true,
    guaranteeDemand: false,
    overCapRefund: false,
    noOrder: false,
    duplicateCharge: false,
    refundEligible: false,
    staleCrm: 0,
    amounts: [1800, 2400, 3600],
    fulfillment: "digital",
    accountStatus: "past_due",
    plan: "pro",
    variants: [
      {
        subject: "Subscription payment does not match the invoice",
        body: "The receipt for {product} shows a different payment than the invoice. Please refund the difference.",
      },
      {
        subject: "Invoice and receipt disagree",
        body: "My subscription payment for {product} posted, but the invoice is higher. Can you refund the gap?",
      },
    ],
  },
  {
    id: "billing-duplicate",
    count: 16,
    cohort: "clear",
    category: "billing",
    confusedAs: null,
    severityIndex: 3,
    highStakes: false,
    legal: false,
    needsAccountLookup: true,
    guaranteeDemand: false,
    overCapRefund: false,
    noOrder: false,
    duplicateCharge: true,
    refundEligible: true,
    staleCrm: 0,
    amounts: [1800, 2400, 4200],
    fulfillment: "delivered",
    accountStatus: "active",
    plan: "pro",
    variants: [
      {
        subject: "Duplicate charge on my invoice",
        body: "I was charged {amount} and the receipt shows a second payment for the {product}. Please refund the extra charge.",
      },
      {
        subject: "Duplicate payment on the receipt",
        body: "The invoice for {product} was charged twice, {amount} each time. Please refund the duplicate.",
      },
    ],
  },
  {
    id: "shipping-clear",
    count: 36,
    cohort: "clear",
    category: "shipping",
    confusedAs: null,
    severityIndex: 2,
    highStakes: false,
    legal: false,
    needsAccountLookup: true,
    guaranteeDemand: false,
    overCapRefund: false,
    noOrder: false,
    duplicateCharge: false,
    refundEligible: false,
    staleCrm: 0,
    amounts: [2400, 4200, 6800],
    fulfillment: "delayed",
    accountStatus: "active",
    plan: "pro",
    variants: [
      {
        subject: "Package tracking has stopped",
        body: "The carrier still has the {product} in transit. It never shipped from the warehouse, so delivery is late.",
      },
      {
        subject: "Tracking has stalled",
        body: "The package of {product} is still in transit.",
      },
    ],
  },
  {
    id: "technical-clear",
    count: 32,
    cohort: "clear",
    category: "technical",
    confusedAs: null,
    severityIndex: 2,
    highStakes: false,
    legal: false,
    needsAccountLookup: true,
    guaranteeDemand: false,
    overCapRefund: false,
    noOrder: false,
    duplicateCharge: false,
    refundEligible: false,
    staleCrm: 0,
    amounts: [0, 2900],
    fulfillment: "digital",
    accountStatus: "active",
    plan: "pro",
    variants: [
      {
        subject: "API timeout on the dashboard",
        body: "The webhook returns an error and the export hits the same bug after login.",
      },
      {
        subject: "Dashboard error",
        body: "The export of {product} failed this morning.",
      },
    ],
  },
  {
    id: "account-clear",
    count: 24,
    cohort: "clear",
    category: "account",
    confusedAs: null,
    severityIndex: 3,
    highStakes: false,
    legal: false,
    needsAccountLookup: true,
    guaranteeDemand: false,
    overCapRefund: false,
    noOrder: true,
    duplicateCharge: false,
    refundEligible: false,
    staleCrm: 0,
    amounts: [0],
    fulfillment: "none",
    accountStatus: "locked",
    plan: "pro",
    variants: [
      {
        subject: "Password and two-factor will not work",
        body: "Please deactivate my teammate's SSO username. I cannot get in.",
      },
      {
        subject: "Password and username",
        body: "Two-factor failed and I cannot get in.",
      },
    ],
  },
  {
    id: "returns-clear",
    count: 28,
    cohort: "clear",
    category: "returns",
    confusedAs: null,
    severityIndex: 1,
    highStakes: false,
    legal: false,
    needsAccountLookup: true,
    guaranteeDemand: false,
    overCapRefund: false,
    noOrder: false,
    duplicateCharge: false,
    refundEligible: false,
    staleCrm: 0,
    amounts: [2400, 3600],
    fulfillment: "delivered",
    accountStatus: "active",
    plan: "free",
    variants: [
      {
        subject: "RMA and a return label",
        body: "The {product} is unworn. I would like to exchange it. What is the restocking process?",
      },
      {
        subject: "Exchange request",
        body: "The {product} is unworn. Please send a return label.",
      },
    ],
  },
  {
    id: "other-clear",
    count: 26,
    cohort: "clear",
    category: "other",
    confusedAs: null,
    severityIndex: 0,
    highStakes: false,
    legal: false,
    needsAccountLookup: false,
    guaranteeDemand: false,
    overCapRefund: false,
    noOrder: true,
    duplicateCharge: false,
    refundEligible: false,
    staleCrm: 0,
    amounts: [0],
    fulfillment: "none",
    accountStatus: "active",
    plan: "free",
    variants: [
      {
        subject: "Referral and office hours",
        body: "A compliment for the team, plus a question about the wholesale catalog and a partnership.",
      },
      {
        subject: "Wholesale catalog and a compliment",
        body: "Who owns partnerships, what are your office hours, and do you have a referral program?",
      },
    ],
  },
  {
    id: "confused-shipping-as-billing",
    count: 12,
    cohort: "confused",
    category: "shipping",
    confusedAs: "billing",
    severityIndex: 2,
    highStakes: false,
    legal: false,
    needsAccountLookup: true,
    guaranteeDemand: false,
    overCapRefund: false,
    noOrder: false,
    duplicateCharge: false,
    refundEligible: false,
    staleCrm: 2,
    amounts: [4200, 6800],
    fulfillment: "delayed",
    accountStatus: "active",
    plan: "pro",
    variants: [
      {
        subject: "Invoice payment",
        body: "Please refund this. Tracking for the package is also late for the {product}.",
      },
    ],
  },
  {
    id: "confused-technical-as-account",
    count: 10,
    cohort: "confused",
    category: "technical",
    confusedAs: "account",
    severityIndex: 2,
    highStakes: false,
    legal: false,
    needsAccountLookup: true,
    guaranteeDemand: false,
    overCapRefund: false,
    noOrder: false,
    duplicateCharge: false,
    refundEligible: false,
    staleCrm: 2,
    amounts: [0],
    fulfillment: "digital",
    accountStatus: "active",
    plan: "pro",
    variants: [
      {
        subject: "Password and SSO",
        body: "My teammate is stuck. The dashboard shows an error too.",
      },
    ],
  },
  {
    id: "confused-returns-as-shipping",
    count: 8,
    cohort: "confused",
    category: "returns",
    confusedAs: "shipping",
    severityIndex: 1,
    highStakes: false,
    legal: false,
    needsAccountLookup: true,
    guaranteeDemand: false,
    overCapRefund: false,
    noOrder: false,
    duplicateCharge: false,
    refundEligible: false,
    staleCrm: 2,
    amounts: [3600],
    fulfillment: "delivered",
    accountStatus: "active",
    plan: "pro",
    variants: [
      {
        subject: "Package in transit",
        body: "The carrier scan is late. I still need a return label for the exchange.",
      },
    ],
  },
  {
    id: "confused-billing-as-returns",
    count: 8,
    cohort: "confused",
    category: "billing",
    confusedAs: "returns",
    severityIndex: 3,
    highStakes: false,
    legal: false,
    needsAccountLookup: true,
    guaranteeDemand: false,
    overCapRefund: false,
    noOrder: false,
    duplicateCharge: false,
    refundEligible: false,
    staleCrm: 1,
    amounts: [4200],
    fulfillment: "delivered",
    accountStatus: "active",
    plan: "pro",
    variants: [
      {
        subject: "Unworn exchange",
        body: "Please send a return label. I was also charged for the {product} and need a refund.",
      },
    ],
  },
  {
    id: "confused-account-as-technical",
    count: 8,
    cohort: "confused",
    category: "account",
    confusedAs: "technical",
    severityIndex: 3,
    highStakes: false,
    legal: false,
    needsAccountLookup: true,
    guaranteeDemand: false,
    overCapRefund: false,
    noOrder: true,
    duplicateCharge: false,
    refundEligible: false,
    staleCrm: 1,
    amounts: [0],
    fulfillment: "none",
    accountStatus: "locked",
    plan: "enterprise",
    variants: [
      {
        subject: "Dashboard error",
        body: "There is a timeout too. I also cannot reset the password.",
      },
    ],
  },
  {
    id: "border-refund-over-cap",
    count: 12,
    cohort: "borderline",
    category: "billing",
    confusedAs: null,
    severityIndex: 3,
    highStakes: false,
    legal: false,
    needsAccountLookup: true,
    guaranteeDemand: false,
    overCapRefund: true,
    noOrder: false,
    duplicateCharge: true,
    refundEligible: true,
    staleCrm: 0,
    amounts: [8900, 12900, 18400, 24900],
    fulfillment: "delivered",
    accountStatus: "active",
    plan: "pro",
    variants: [
      {
        subject: "Duplicate invoice",
        body: "Please refund it. The package tracking looks odd too. It was {amount} for the {product}.",
      },
    ],
  },
  {
    id: "border-guarantee",
    count: 10,
    cohort: "borderline",
    category: "technical",
    confusedAs: null,
    severityIndex: 3,
    highStakes: false,
    legal: false,
    needsAccountLookup: true,
    guaranteeDemand: true,
    overCapRefund: false,
    noOrder: false,
    duplicateCharge: false,
    refundEligible: false,
    staleCrm: 0,
    amounts: [0],
    fulfillment: "digital",
    accountStatus: "active",
    plan: "pro",
    variants: [
      {
        subject: "Login error",
        body: "There is a bug. Please guarantee this will never happen again. My teammate is locked out as well.",
      },
    ],
  },
  {
    id: "border-shipping",
    count: 12,
    cohort: "borderline",
    category: "shipping",
    confusedAs: null,
    severityIndex: 2,
    highStakes: false,
    legal: false,
    needsAccountLookup: true,
    guaranteeDemand: false,
    overCapRefund: false,
    noOrder: false,
    duplicateCharge: false,
    refundEligible: false,
    staleCrm: 0,
    amounts: [2400, 6800],
    fulfillment: "in_transit",
    accountStatus: "active",
    plan: "free",
    variants: [
      {
        subject: "Tracking has paused",
        body: "The package is in transit. I also noticed the payment.",
      },
    ],
  },
  {
    id: "stakes-chargeback",
    count: 8,
    cohort: "stakes",
    category: "billing",
    confusedAs: null,
    severityIndex: 4,
    highStakes: true,
    legal: true,
    needsAccountLookup: true,
    guaranteeDemand: false,
    overCapRefund: false,
    noOrder: false,
    duplicateCharge: false,
    refundEligible: false,
    staleCrm: 0,
    amounts: [12900, 24900],
    fulfillment: "delivered",
    accountStatus: "past_due",
    plan: "enterprise",
    variants: [
      {
        subject: "Chargeback on a duplicate invoice",
        body: "My attorney will file a lawsuit if this payment is not fixed. The receipt shows the charge for {product}.",
      },
    ],
  },
  {
    id: "stakes-breach",
    count: 8,
    cohort: "stakes",
    category: "account",
    confusedAs: null,
    severityIndex: 4,
    highStakes: true,
    legal: false,
    needsAccountLookup: true,
    guaranteeDemand: false,
    overCapRefund: false,
    noOrder: true,
    duplicateCharge: false,
    refundEligible: false,
    staleCrm: 0,
    amounts: [0],
    fulfillment: "none",
    accountStatus: "locked",
    plan: "enterprise",
    variants: [
      {
        subject: "Data breach and an account takeover",
        body: "Someone reset the password and the SSO username. Please deactivate the teammate access.",
      },
    ],
  },
  {
    id: "stakes-outage",
    count: 8,
    cohort: "stakes",
    category: "technical",
    confusedAs: null,
    severityIndex: 4,
    highStakes: true,
    legal: false,
    needsAccountLookup: true,
    guaranteeDemand: false,
    overCapRefund: false,
    noOrder: false,
    duplicateCharge: false,
    refundEligible: false,
    staleCrm: 0,
    amounts: [0],
    fulfillment: "digital",
    accountStatus: "active",
    plan: "enterprise",
    variants: [
      {
        subject: "Production is down for every merchant",
        body: "The API returns a timeout error and the dashboard shows the same bug.",
      },
    ],
  },
  {
    id: "stakes-shipping-lawyer",
    count: 6,
    cohort: "stakes",
    category: "shipping",
    confusedAs: null,
    severityIndex: 4,
    highStakes: true,
    legal: true,
    needsAccountLookup: true,
    guaranteeDemand: false,
    overCapRefund: false,
    noOrder: false,
    duplicateCharge: false,
    refundEligible: false,
    staleCrm: 0,
    amounts: [6800, 12900],
    fulfillment: "lost",
    accountStatus: "active",
    plan: "enterprise",
    variants: [
      {
        subject: "Package was never shipped",
        body: "My lawyer sent a letter about legal action. The carrier lost it in transit and the warehouse has no delivery scan.",
      },
    ],
  },
];

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "");
}

export function generateDataset(seed = DATASET_SEED): DatasetFile {
  const rng = mulberry32(seed);
  const drafted: SupportCase[] = [];
  let orderSerial = 10000;

  for (const spec of SPECS) {
    if (spec.staleCrm > spec.count) {
      throw new Error(`staleCrm exceeds count for ${spec.id}`);
    }
    for (let n = 0; n < spec.count; n += 1) {
      const variant = spec.variants[n % spec.variants.length] ?? spec.variants[0];
      if (!variant) throw new Error(`missing variant for ${spec.id}`);
      const first = pick(rng, FIRST);
      const last = pick(rng, LAST);
      const product = pick(rng, PRODUCTS);
      const amountCents = pick(rng, spec.amounts);
      const days = spec.refundEligible ? 4 + (n % 8) : 2 + (n % 16);
      const orderId = spec.noOrder ? null : `HBR-${orderSerial++}`;
      const neutral = NEUTRAL[n % NEUTRAL.length] ?? "";
      const vars: Record<string, string> = {
        product,
        amount: money(amountCents),
        orderId: orderId ?? "",
        days: String(days),
        first,
      };
      const subject = fill(variant.subject, vars);
      const body = `${fill(variant.body, vars)} ${neutral}`.trim();
      const stale = n < spec.staleCrm;
      const crmCategory = stale && spec.confusedAs ? spec.confusedAs : spec.category;
      const email = `${slug(first)}.${slug(last)}@example.com`;
      const channel = CHANNELS[n % CHANNELS.length] ?? "email";
      const ticket: Ticket = {
        id: "pending",
        receivedAt: "pending",
        channel,
        subject,
        body,
        customer: { name: `${first} ${last}`, email, plan: spec.plan },
        orderId,
      };
      const customer: CustomerRecord = {
        email,
        name: ticket.customer.name,
        plan: spec.plan,
        accountStatus: spec.accountStatus,
        issueCategory: crmCategory,
      };
      const order: OrderRecord | null = orderId
        ? {
            orderId,
            product,
            amountCents,
            placedAt: "pending",
            daysSincePurchase: days,
            fulfillmentStatus: spec.fulfillment,
            issueCategory: crmCategory,
            duplicateCharge: spec.duplicateCharge,
            refundEligible: spec.refundEligible,
            crmAgreesWithLabel: !stale,
          }
        : null;
      drafted.push({
        ticket,
        order,
        customer,
        label: {
          category: spec.category,
          severityIndex: spec.severityIndex,
          isHighStakes: spec.highStakes,
          needsAccountLookup: spec.needsAccountLookup,
          hasLegalThreat: spec.legal,
        },
        generator: {
          cohort: spec.cohort,
          scenarioId: spec.id,
          confusedAs: spec.confusedAs,
          guaranteeDemand: spec.guaranteeDemand,
          overCapRefund: spec.overCapRefund,
        },
      });
    }
  }

  for (let i = drafted.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const swap = drafted[i];
    const other = drafted[j];
    if (!swap || !other) continue;
    drafted[i] = other;
    drafted[j] = swap;
  }

  const base = Date.UTC(2026, 10, 18, 16, 0, 0);
  drafted.forEach((supportCase, index) => {
    const received = new Date(base - index * 8 * 60 * 1000).toISOString();
    supportCase.ticket.id = `tkt_${String(index + 1).padStart(4, "0")}`;
    supportCase.ticket.receivedAt = received;
    if (supportCase.order) {
      const placed = new Date(
        base - index * 8 * 60 * 1000 - supportCase.order.daysSincePurchase * 24 * 60 * 60 * 1000,
      ).toISOString();
      supportCase.order.placedAt = placed;
    }
  });

  const counts = SPECS.reduce((sum, spec) => sum + spec.count, 0);
  if (drafted.length !== counts) {
    throw new Error(`expected ${counts} cases, built ${drafted.length}`);
  }

  return {
    version: 1,
    seed,
    synthetic: true,
    description:
      "Synthetic Harbor support tickets. Labels were authored with the scenarios, not assigned by a model. No real customer data.",
    cases: drafted,
  };
}
