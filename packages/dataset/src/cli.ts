import { writeFileSync } from "node:fs";
import { generateDataset } from "./generate.js";

const dataset = generateDataset();
const target = new URL("../data/cases.json", import.meta.url);
writeFileSync(target, `${JSON.stringify(dataset, null, 2)}\n`);
console.log(`Wrote ${dataset.cases.length} synthetic cases to ${target.pathname}`);
