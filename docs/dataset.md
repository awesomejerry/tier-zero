# Dataset

`packages/dataset/data/cases.json` is 300 synthetic Harbor support tickets. Harbor, in this demo, is a commerce platform: shoppers write about orders, and merchants write about the product, payouts, and access. No real customer wrote any of these, and no model labeled them.

## How they were made

`packages/dataset/src/generate.ts` expands a fixed list of scenarios with seed `20261119` (mulberry32). Each scenario has a true category, a severity, a stakes flag, a legal flag, and one or two sentence frames. The generator fills product, amount, customer, and a neutral closing line, then shuffles the inbox.

The frames were written against the mock System One lexicon in `packages/providers/src/heuristic.ts`. A clear billing ticket contains several billing phrases and none from the other queues. A confused ticket leads with another queue's phrases and keeps a thinner trail of the true one, so a bag-of-words scorer picks the wrong category at a modest confidence. A borderline ticket is the reverse: the true queue wins, narrowly. Stakes tickets contain an unmistakable phrase (`attorney`, `chargeback`, `data breach`, `production is down for every merchant`) plus the phrases of their real queue.

Labels are the scenario's authored fields. They are not the heuristic's output, and they are not a model's output. Eight confused tickets also carry a stale CRM category. The scripted agent trusts that field, so escalating those eight does not fix the category. That is why the mock baseline tops out at 97.3% instead of 100%.

Cohorts, after the shuffle:

| Cohort | Tickets | What the heuristic should do |
| --- | --- | --- |
| clear | 190 | Correct category, operational confidence at least 0.80 |
| borderline | 34 | Correct category, confidence roughly 0.64 to 0.80. Includes the over-cap refunds and the guarantee demands. |
| confused | 46 | Wrong category, confidence under 0.88 |
| stakes | 30 | Correct category, high-stakes probability 0.96. Always escalated. |

A test locks those bands. Editing a sentence without re-running the test will fail CI if the scorer stops agreeing with the scenario.

Names are ordinary given names plus family names. Emails are `@example.com`. Order ids look like `HBR-10021`. Amounts are chosen so some duplicate charges sit under the $50 auto-refund cap and twelve sit over it.

## What the mock is allowed to see

The heuristic scores subject and body only. It does not read `label`, `cohort`, or the order record.

The scripted agent may read tool output. `lookup_order` returns the commerce record, including `issueCategory`. For the 292 tickets whose CRM tag matches the label, the agent recovers the category. For the eight stale tags, it repeats the mistake. Refund eligibility and the amount come from the same record. The agent proposes the full amount anyway. The guardrail, not the agent, enforces the cap.

## Regenerating

```bash
pnpm generate:dataset
pnpm test
pnpm benchmark
```

`pnpm test` checks the committed JSON against `generateDataset()`. `pnpm benchmark --check` checks the committed chart. Commit both if you change the generator or the heuristic.
