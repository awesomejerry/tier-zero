import type { DecisionRequest, DecisionResult, SystemOneProvider } from "@tier-zero/core";

/**
 * TypeSafe Jev, a System One model.
 *
 * TODO(jerry): Jev is early-access only and this project does not have
 * credentials, so the adapter fails closed instead of pretending to answer.
 * https://typesafe.ai/blog/introducing-system-one-models-and-jev
 *
 * When access lands:
 * 1. Confirm the HTTP schema. The public post describes behavior (typed
 *    probabilities, parallel sampling, about $0.042 / 1M input tokens, output
 *    free, roughly 70–500ms) but not a stable request body.
 * 2. Map DecisionRequest onto that schema. Keep question names unique and
 *    preserve predicate / choice / score.
 * 3. Map the response onto DecisionResult, including whatever calibrated
 *    probability field Jev returns, and set simulated to false.
 * 4. Add a price row. Do not reuse the OpenAI Decisions rates.
 */
export class JevNotAvailableError extends Error {
  constructor() {
    super(
      "TODO: Jev adapter is not implemented. TypeSafe Jev is early access and this project has no credentials. See packages/providers/src/jev.ts.",
    );
    this.name = "JevNotAvailableError";
  }
}

export class JevSystemOneProvider implements SystemOneProvider {
  readonly id = "jev";
  readonly simulated = false;

  decide(_request: DecisionRequest): Promise<DecisionResult> {
    return Promise.reject(new JevNotAvailableError());
  }
}
