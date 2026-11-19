# RevenuePilot — AI Sales & Marketing Agent for small businesses

An AI revenue engine that researches prospects, scores buying intent, drafts personalized outreach and writes on-brand LinkedIn posts. Every AI call goes through **TokenRouter** to the cheapest model that can handle the task, and the app shows the model, tokens, cost and savings for each call.

## Run it

```bash
npm install
cp .env.example .env.local   # add TOKENROUTER_API_KEY for live AI
npm run dev                  # http://localhost:3000
```

Without a key the app runs in **simulated mode**: you get templated outputs and token counts estimated from text length, and every result is labelled "simulated". With a key, every call is a real TokenRouter request, and costs are calculated from the token counts TokenRouter returns.

| Env var | Purpose |
|---|---|
| `TOKENROUTER_API_KEY` | Gateway key (`tr_...`). Read on the server only and never sent to the browser. |
| `TOKENROUTER_BASE_URL` | Defaults to `https://api.tokenrouter.io/v1` |
| `TOKENROUTER_MODEL_ECONOMY / _BALANCED / _PREMIUM` | Gateway model IDs per tier (defaults: `openai/gpt-5-nano`, `openai/gpt-5-mini`, `anthropic/claude-sonnet-4-5`) |

## 2-minute demo script

1. **Dashboard**: start with the fictional sample pipeline. It shows 6 prospects with free rule-based intent scores and $0 of AI spend.
2. **Agent Workflow → Run agent workflow** (Northwind Family Dental). The agent runs four steps in order:
   - Research → GPT-5 nano (economy)
   - Intent score → rule signals plus a nano adjustment of up to ±10
   - Outreach email → GPT-5 mini (balanced)
   - LinkedIn post → GPT-5 mini

   Each step shows its model, tokens, cost and how much it saved compared with the premium model. The **Run cost** panel shows the total cost of the run next to what an all-premium run would have cost.
3. Click **Approve outreach** and **Approve post**. Nothing is sent or published automatically.
4. Untick **Fresh run** and run the workflow again. The stored research and score are reused at $0.
5. **Cost Router**: shows the model catalog, the routing policy, a cost-by-task chart and a log of every request.
6. **Dashboard → Generate** today's recommendations, which takes one economy-model call.

## How cost is kept low

- **Routing by complexity.** Extraction and scoring go to the economy tier. Writing goes to the balanced tier. The "Premium" toggle moves a task up one tier. Logic: `src/lib/models.ts`.
- **Rules first.** Intent scores are deterministic (`src/lib/scoring.ts`). The model only adjusts the score by up to ±10 and explains why.
- **No repeat spend.**
  - Identical requests are cached on the server for 6 hours.
  - Research and scores are stored per prospect and reused unless you ask for a fresh run.
  - Recommendations are generated once a day.
- **Bounded retries.** If a model returns unparseable JSON, the request moves up one tier once. There are no open-ended agent loops.
- **Small prompts.** Only the fields a task needs are sent. Notes are cut to 500 characters and website text to 1,800.
- **Measurable savings.** Each call's tokens are also priced on the premium model, so savings use the same token counts on both sides.

## Architecture

- Next.js 14 (App Router) + TypeScript + Tailwind + Recharts
- `src/app/api/agent/[task]`: one server route per agent task (`research`, `score`, `outreach`, `linkedin`, `recommendations`)
- `src/app/api/status`: shows the current mode and routing policy. `?check=1` checks the key against `GET /models`, which spends no tokens.
- `src/lib/llm.ts`: TokenRouter client (OpenAI-compatible `/chat/completions`), cache and escalation
- `src/lib/store.tsx`: client state (prospects, content, usage log), saved to `localStorage`

## Limitations (honest)

- **No real prospect data.**
  - No live web search or contact-enrichment API is connected.
  - Research uses the notes you enter plus the prospect's homepage text, when the domain can be reached.
  - Decision-makers are inferred *roles*, not people.
- **Sample data is fictional.** Sample companies and contacts are made up. "Weighted opportunity" is deal value × intent score: an estimate, not revenue.
- **Estimated prices.** Costs use list-price estimates in `src/lib/models.ts`. Your actual TokenRouter or provider bill may differ.
- **No email or LinkedIn integration.** Approved items are copied and sent by hand.
- **No auth or database.** The repo had neither, so data is stored in the browser per user. Clear it with "Reset demo data".
- **Not tested against a live key.** The live TokenRouter path has not been run in development. Use **Cost Router → Verify key** after adding your key.

## Tests

```bash
npm test         # router selection, pricing, scoring, JSON parsing
npm run typecheck
npm run build
```
