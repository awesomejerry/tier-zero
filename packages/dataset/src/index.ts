import raw from "../data/cases.json";
import { parseDataset } from "./parse.js";

export { generateDataset, DATASET_SEED, type DatasetFile } from "./generate.js";
export { parseDataset } from "./parse.js";

export const dataset = parseDataset(raw);
export const cases = dataset.cases;
