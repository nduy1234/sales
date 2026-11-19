# RevenuePilot: an autonomous AI Marketing & Sales Agent for small businesses

RevenuePilot finds high-intent prospects, researches and scores them, decides who deserves outreach, drafts personalized emails, and writes brand-consistent, SEO-aware content for **LinkedIn and X**. Approved content is scheduled into the best posting windows. Every AI call goes to the **cheapest model that can do the job** (via TokenRouter), and the app shows the cost of each step and the projected revenue impact.

## Run it

```bash
npm install
cp .env.example .env.local   # add TOKENROUTER_API_KEY for live AI
npm run dev                  # http://localhost:3000
```

| Secret (server-only) | Purpose |
|---|---|
| `TOKENROUTER_API_KEY` | Live model calls for the in-app agent. Without it the app runs in **simulated mode**: outputs are templated and costs are estimated from text length. Everything simulated is labelled. |
| `HR_API_KEY` | HarnessRouter key for the cloud **Research Agent** (live web and LinkedIn research). Set it as an env var or in the git-ignored `.env.harnessrouter`. |
| `TOKENROUTER_BASE_URL`, `TOKENROUTER_MODEL_*` | Optional overrides (see `.env.example`) |

## 2-minute judge demo

1. **Dashboard.** Shows the pipeline, revenue impact, approval queue and AI spend, which starts at $0.
2. **Autopilot → Run Autopilot.** One click starts the agent. It:
   - picks the top uncontacted prospects
   - researches and scores each one
   - **decides** who clears the intent threshold
   - drafts outreach for those that do
   - writes today's LinkedIn post and X thread on the strongest pain point it found

   The activity timeline shows each decision with its model, tokens and cost. Example in simulated mode: 3 prospects plus 2 posts for **$0.002, against $0.032 all-premium (about 93% saved)**.
3. **Approve all** in the approval queue. Posts are scheduled automatically: LinkedIn Tue–Thu at 9:00, X on weekdays at 12:30.
4. **Content Studio.** The 7-day calendar shows the queue. **Open in LinkedIn/X** opens the platform's own composer with the text filled in; you press Post.
5. **Dashboard → Revenue impact** shows:
   - pipeline engaged
   - projected revenue (intent-weighted)
   - owner hours saved
   - return on AI spend

   Funnel assumptions are editable.
6. **Cost Router** lists every call: the model chosen, why, tokens, cost and savings.
7. *(With `HR_API_KEY`)* **Research Agent.** A cloud agent researches public buying signals with sources and dates. **Add N to pipeline** imports the prospects it found, ready for the next Autopilot run.

## What's inside

| Feature | Where |
|---|---|
| Autopilot: bounded multi-prospect agent run that decides who to contact (intent threshold) | `src/app/autopilot` |
| Approval queue: nothing is sent or posted without you | `src/components/ApprovalQueue.tsx` |
| Single-lead workflow, a step-by-step deep dive | `src/app/workflow` |
| Prospect research, rule-plus-AI intent scoring, outreach drafts | `src/app/prospects`, `src/lib/scoring.ts` |
| LinkedIn posts and X threads (280-character check), SEO keywords, hooks, brand voice | `src/app/content`, `src/lib/tasks.ts` |
| Scheduling into posting windows, due alerts, compose links | `src/lib/schedule.ts` |
| Revenue impact projection and time saved | `src/lib/revenue.ts`, `src/components/RevenueImpact.tsx` |
| Cost-optimized router: economy, balanced and premium tiers, caching, one bounded escalation | `src/lib/models.ts`, `src/lib/llm.ts` |
| Cloud Research Agent (HarnessRouter) with streamed progress, cancel, follow-ups and file downloads | `src/app/research`, `src/lib/harnessrouter/`, `harnessrouter.json` |
| Importing discovered prospects from the agent's evidence table | `src/lib/discovery.ts` |

### How cost stays low

| Task | Tier |
|---|---|
| Research, scoring, X threads, daily plan | Economy model |
| LinkedIn posts, outreach | Balanced model |
| Anything with Premium switched on | One tier up, only when you ask |

- **Rules before AI.** Intent scores come from fixed rules; the model can only adjust them by ±10.
- **Smart reuse.** Research and scores are stored and reused, identical requests are cached on the server, and Autopilot skips writing calls for low-intent leads.
- **Bounded retries.** Unparseable output escalates at most once. There are no open-ended loops.

## Honest limitations

- **No live posting.** No LinkedIn or X account is connected. Scheduling is an in-app queue: when a post is due, you open the platform's composer with the text already filled in and press Post. X threads open with tweet 1 filled in; the rest are copied.
- **Discovery needs the Research Agent.** Live prospect discovery requires `HR_API_KEY`. The built-in sample prospects are fictional.
- **Projections only.** Revenue and ROI are projections from editable funnel assumptions, not booked revenue.
- **Estimated prices.** Model prices are list-price estimates in `src/lib/models.ts`.
- **No login.**
  - Pipeline and content data live in the browser (`localStorage`).
  - Research Agent tasks live on the server in `.data/` (git-ignored), tied to an anonymous httpOnly cookie ID.

## Tests

```bash
npm test          # 17 tests: router, scoring, scheduling, revenue model, discovery parser, SSE parsing
npm run typecheck
npm run build
```
