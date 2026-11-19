import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generateDataset } from "../src/generate.js";
import { parseDataset } from "../src/parse.js";

describe("seeded dataset", () => {
  it("matches the committed file", () => {
    const committed = JSON.parse(
      readFileSync(new URL("../data/cases.json", import.meta.url), "utf8"),
    ) as unknown;
    expect(committed).toEqual(generateDataset());
  });

  it("parses as 300 synthetic Harbor tickets", () => {
    const committed = JSON.parse(
      readFileSync(new URL("../data/cases.json", import.meta.url), "utf8"),
    ) as unknown;
    const dataset = parseDataset(committed);
    expect(dataset.synthetic).toBe(true);
    expect(dataset.cases).toHaveLength(300);
    expect(new Set(dataset.cases.map((item) => item.ticket.id)).size).toBe(300);
    for (const supportCase of dataset.cases) {
      expect(supportCase.ticket.customer.email.endsWith("@example.com")).toBe(true);
    }
  });
});
