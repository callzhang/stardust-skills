---
name: dingtang-okr-review
description: Use when the user asks to export, review, audit, score, or summarize 叮当OKR/Dingdang OKR objectives, KR progress, CEO OKR review, people progress reports, Q2/Q3/Q4 OKR data, or asks to organize OKR data into Excel and evaluate KR completion with evidence.
---

# Dingtang OKR Review

Use this skill for two related workflows:

1. Export 叮当OKR data into a verified workbook.
2. Perform CEO-level OKR review at KR level using independent evidence.

This skill is for 叮当OKR (`https://dingokr.dingteam.com/...`), not DingTalk OA reports or DingTalk documents.

## Operating Boundaries

- For automated CEO OKR review runners, use a live 叮当OKR Web/API source for the `dingokr.dingteam.com` product. Do not default to Agoal just because the word OKR appears; this tenant has previously exported live OKR data from the Dingteam Web product while Agoal rule APIs returned no objective rule. Re-confirmed: even with all 10 Agoal permissions granted on the DingTalk app, `GET /v1.0/agoal/objectiveRuleLists/query` returns `success:true` with `totalCount:0` — the org uses 叮当OKR (蓝凌), not DingTalk-native Agoal, so the DingTalk Agoal API never has this data.
- Configure the service with `CEO_OKR_SOURCE_KIND=dingteam_web` and `CEO_OKR_LIVE_SOURCE_COMMAND`. The command must accept `{user_id}` and `{period_label}` placeholders and return live JSON containing `processed.objectives` and `processed.okrRows`.
- Three live-source commands are available (all return the same `processed.objectives` / `processed.okrRows`). Prefer the headless-browser source — it does NOT need an always-open Chrome tab:
  - **Preferred — headless browser + token cache** (`dingteam_okr_browser_source.py`): a dedicated, persistent browser profile (default `~/.dingteam-okr-profile`) holds the DingTalk SSO session. One-time interactive login, then the service drives a headless Chromium itself to mint/refresh the session JWT; the JWT is cached (`<profile>/token_cache.json`, mode 600) and reused until ~5 min before its `exp` (~6h), so most fetches launch no browser at all.
    - One-time (or when the DingTalk session expires): `python3 /Users/derek/.agents/skills/dingtang-okr-review/scripts/dingteam_okr_browser_source.py login` (opens a window; scan the DingTalk QR once).
    - `CEO_OKR_LIVE_SOURCE_COMMAND=/Users/derek/.agents/skills/dingtang-okr-review/scripts/dingteam_okr_browser_source.py fetch --user-id {user_id} --period-label {period_label}`
    - Requires `pip install playwright` (uses system Chrome via `channel="chrome"`). The dedicated profile is the source's OWN session store, not the user's Chrome profile; it never reads the user's Chrome cookie store and never prints the token.
  - **Alternative — direct API via open tab** (`dingteam_okr_direct_source.py`): touches an already-authorized `dingokr.dingteam.com` Chrome tab once (osascript) to read the live session header, then fetches all OKR data via direct server-side HTTP.
    `CEO_OKR_LIVE_SOURCE_COMMAND=/Users/derek/.agents/skills/dingtang-okr-review/scripts/dingteam_okr_direct_source.py --user-id {user_id} --period-label {period_label}`
  - **Fallback — page injection** (`/Users/derek/Documents/Projects/ceo-agent-service/scripts/dingteam_okr_live_source.py`): injects an extraction script that uses the page's `webpackChunkallinone` module and polls a DOM result attribute. It auto-opens a `dingokr.dingteam.com` tab if none is present (reusing the Chrome login session), and — like the other sources — also fetches the 评论/进展 comments via `findCommentListV2` and merges them into `krDetailsUpdatesAggregated`.
  - All three ultimately depend on a logged-in DingTalk session (the JWT is minted by 叮当OKR's DingTalk SSO and cannot be reproduced from stored AppKey/Secret without 叮当OKR's official OpenAPI). The headless source reduces this to a periodic background QR re-login when the session expires. On any failure they fail fast; do not fall back to stale local exports.
- Use Agoal `agoal_1.0` only when the enterprise's OKR data is confirmed to be exposed through Agoal objective APIs. Required permissions normally include `Agoal.Objective.Read`, `Agoal.ObjectiveRule.Read`, `Agoal.Period.Read`, and `Agoal.ObjectiveProgress.Read`; org-performance plan/document APIs additionally require `Agoal.OrgPerfPlan.Read` / `Agoal.OrgPerfDoc.Read`.
- For Agoal mode, use `CEO_OKR_SOURCE_KIND=agoal` and `CEO_OKR_OBJECTIVE_RULE_ID` when the enterprise has multiple Agoal rules. If the rule or period cannot be resolved unambiguously, fail fast and expose the configuration error.
- Use the user's logged-in Chrome tab only for interactive workbook export or for fields not exposed by the API. Chrome export does not require DingTalk Open Platform AppKey/AppSecret; it requires the browser user to be logged in and authorized to view the target OKR data.
- Do not inspect Chrome cookies, localStorage, browser profile files, passwords, or session stores.
- Do not print tokens, secrets, cookies, or authorization headers.
- Do not read local OKR/source files when the user asks to pull from 叮当 OKR; the source of truth is live 叮当OKR Web/API data or the authorized online page.
- For review/scoring, first export or load the OKR workbook, then use only user-authorized evidence sources: local files, `memory_recall`, and `dws` search/read commands.

## Live API Source For Review

For an automated OKR review request in this Dingteam Web tenant, collect live data in this order:

1. Run `CEO_OKR_LIVE_SOURCE_COMMAND`, substituting `{user_id}` and `{period_label}`.
2. Verify the returned JSON is live 叮当OKR data and contains `processed.objectives` and `processed.okrRows`.
3. Each KR row must include parent O, O weight/progress, KR title, KR weight/progress, and `krDetailsUpdatesAggregated`.
4. Pass the processed live JSON into the OKR review runner. If the command or API call fails, report that live OKR data is unavailable; do not silently fall back to old local exports.

The preferred `dingteam_okr_direct_source.py` calls these private 叮当OKR endpoints (base `https://dingokr.dingteam.com`, all `POST`, reusing the captured session headers — `Authorization`, `X-Dingteam-Auth-App-Id`, `X-Space-Id`, etc.):

| Step | Endpoint | Body |
| --- | --- | --- |
| period list | `/data/okr/person/period/list` | `{"userId"}` |
| objectives + KR cells | `/data/okr/objective/showListView/v2` | `{"mainId","type":0,"search":{"userIds","pageNo","pageSize"}}` |
| KR detail | `/data/okr/objective/findKrDetail` | `{"objId","krId"}` |
| KR progress history | `/data/okr/objective/log/progressHistory` | `{"objectiveId","krId"}` |
| 评论/进展 comments | `/data/okr/objective/findCommentList/v2` | `{"objectiveId","pageNo","pageSize","sort":false,"logTypeCells":[],"krId":"","commentId":""}` |

CRITICAL for scoring: the numeric KR progress is often 0 even when there is real progress, because people write their progress as **comments/进展 (评论)** rather than moving the % slider. `findCommentList/v2` returns those records (`type==5` = 评论; each item has `richTextContent`, `creator`, `createAt`, and `krInfo.krId`/`krInfo.name` to map to a KR). The source fetches them per objective, maps each to its KR (by `krInfo.krId`, then by matching `krInfo.name` to the KR title), and merges them into `krDetailsUpdatesAggregated` (KR-level) and `objectiveCommentsAggregated` (objective-level). Do NOT score from the numeric progress alone — use these comment records as the primary progress evidence.

It matches the requested period via the same normalization as the page (`2026 Q2` / `2026年2季度` / `2026年二季度` → `2026q2`), aggregates each KR's progress history into `krDetailsUpdatesAggregated` (`时间 | 进度变化 | 说明`, or `[未撰写进度]` when empty), and never prints the auth token. Unit tests live next to it: `scripts/test_dingteam_okr_direct_source.py`.

For confirmed Agoal tenants, collect live data in this order:

1. Resolve the Agoal objective rule.
   - Prefer configured `CEO_OKR_OBJECTIVE_RULE_ID`.
   - Otherwise query `GET /v1.0/agoal/objectiveRuleLists/query`; if exactly one rule is not available, stop and ask for the rule id.
2. Resolve the period by querying `GET /v1.0/agoal/objectiveRules/periodLists?objectiveRuleId=...` and matching the requested period, for example `2026 Q2` to `2026年二季度` / `2026年2季度`.
3. Query the user's objectives with `POST /v1.0/agoal/users/objectiveLists/query` using `dingUserId`, `objectiveRuleId`, and `periodIds`.
4. For each objective, query detail with `GET /v1.0/agoal/objectives/details?objectiveId=...`.
5. For each objective, query progress history with `GET /v1.0/agoal/objectives/progresses/lists?objectiveId=...`.
6. Before invoking the OKR review runner, the worker must merge objective detail and progress data into a processed O/KR hierarchy: `processed.objectives` and `processed.okrRows`. Each KR row must include parent O, O weight/progress, KR title, KR weight/progress, and `krDetailsUpdatesAggregated`.
7. Pass the processed live JSON into the OKR review runner. If any API call fails, report that live OKR data is unavailable; do not silently fall back to old local exports.

## Export Output

Create one workbook under:

```text
outputs/dingteam-okr-<period-slug>/dingteam_okr_<period-slug>.xlsx
```

Use these sheets:

- `Summary`: period, generation time, people count, cockpit target count, by-person objective total, average progress, task metrics.
- `People Overview`: one row per person with department, objective count, confirming/aligned/unaligned counts, Q2 progress, profile user id, profile URL.
- `Data Quality`: mismatches and no-detail profiles.
- One tab per person, named with a stable numeric prefix, for example `01_ET`, `22_Roy Han`.

Each person tab must use a hierarchical row structure:

| Level | O | O Progress | O Weight | KR | KR Progress | KR Weight | KR Details Updates (Aggregated) | Text |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| O | O1: Objective title | 50% | 100% | | | | | raw objective text |
| KR | O1: Objective title | 50% | 100% | KR1: KR content | 40% | 30% | aggregated update history | KR content |

Rules:

- O and KR are separate columns.
- O rows contain O details and leave KR blank.
- KR rows repeat the parent O in the O column so later AI review has local context.
- O Weight and KR Weight are both mandatory columns.
- `KR Details Updates (Aggregated)` should contain aggregated KR-detail update history when the raw capture has it.
- If the `所有记录` capture ran successfully but a KR has no matching progress/comment record, write `[未撰写进度]`.
- Use `未采集` only when KR detail/update capture was not run or failed, not when the person simply did not write KR progress.

Always keep the raw JSON capture next to the workbook for audit:

```text
outputs/dingteam-okr-<period-slug>/dingteam_okr_<period-slug>_raw.json
```

## Export Workflow

1. Confirm the target period and source page.
   - Example: `2026年2季度` with range `2026/03/31-2026/06/30`.
   - Open or claim the 叮当OKR Chrome tab.
   - Navigate to `#/report` and select the target period if needed.

2. Check whether `dws` has native OKR support or use the OpenAPI source:

```bash
dws --help
dws okr --help
```

If OKR is not listed as a service and the task is automated review, use the configured live source command. Use Agoal only after confirming the tenant's OKR data is exposed through Agoal APIs. If the task is interactive workbook export, continue with Chrome.

3. In the 叮当OKR report page:
   - Use `推行驾驶舱`.
   - Confirm the page shows `制定对齐详情`.
   - Switch pagination to `100 条/页` to avoid duplicate or missing rows at page boundaries.
   - Extract the visible people table: name, department, objective count, confirming count, aligned count, unaligned count.

4. For every person row:
   - Use a real row click, not `data-row-key`, because `data-row-key` changes across refreshes and is not the stable profile user id.
   - Wait for `#/okr/profile?profileUserId=...`.
   - Extract `document.body.innerText`.
   - Store `profileUserId`, `profileUrl`, `profileText`, and metadata.
   - For each visible objective in the target period, open the objective detail drawer and extract the `所有记录` list.
   - Map records whose reference starts with or contains `评论KR` to the matching `objectiveCode` + `krCode`; save those as `krUpdates`.
   - Also map progress-change rows to KR details when the record `ref` exactly or unambiguously matches a KR title from the same objective. These rows usually contain `状态`, `进度`, and `说明`, and are the main source for "why this progress" leads.
   - Keep objective-level replies, new-objective/new-KR events, or ambiguous records separately as unscoped records; do not attach them to a KR unless the record has a clear `评论KR` reference or an unambiguous KR-title match.
   - Return to `#/report`, ensure `100 条/页`, and continue.

5. Build the workbook with the bundled script:

```bash
node /Users/derek/.agents/skills/dingtang-okr-review/scripts/build_workbook.mjs \
  --input /absolute/path/to/dingteam_okr_2026q2_raw.json \
  --output-dir /absolute/path/to/outputs/dingteam-okr-2026q2 \
  --period-label 2026年2季度 \
  --period-slug 2026q2
```

6. Verify the `.xlsx` before reporting completion.
   - Import the workbook using `@oai/artifact-tool` when available, or `openpyxl` as a fallback.
   - Check that `People Overview` has one header row plus all people.
   - Check that the total `Level = O` rows across person tabs equals the sum of by-person objective counts, excluding explicit no-detail zero-OKR rows.
   - Check that person tabs exist for every person row.
   - Scan for `#REF!`, `#DIV/0!`, `#VALUE!`, `#NAME?`, `#N/A`.

## CEO OKR Review Workflow

Use this when the user asks to review, audit, or score a person's OKR.

### 1. Inputs

Start from the exported workbook or freshly exported OKR data. For each KR, collect:

- parent objective
- KR wording
- KR weight
- self-reported KR progress
- `KR Details Updates (Aggregated)`
- expected deadline or timing requirement from the KR text, OKR notes, or review context

If a KR has no clear deadline, mark `deadline=未明确` and do not apply the time discount.

### 2. Evidence Sources

Use independent evidence. KR self-progress and KR progress notes are leads, not proof.

Allowed evidence sources:

- Local files explicitly relevant to the KR, such as project docs, delivery notes, proposals, reports, spreadsheets, code/repo artifacts, or meeting exports.
- Cloud memory through `memory_recall`, especially prior decisions, project status, customer context, delivery facts, and reusable business knowledge.
- `dws` search/read commands, selected by evidence type:
  - `dws doc` / `dws wiki` for DingTalk documents and knowledge-base material.
  - `dws minutes` for AI 听记 transcript/summary/todo/speaker evidence.
  - `dws aisearch` / `dws contact` for people, org, owner, and responsibility verification.
  - `dws report`, `dws todo`, `dws chat`, `dws calendar`, or other relevant products when the KR evidence lives there.

Do not use unsupported inference as evidence. If a claim cannot be verified, mark it as `证据不足`.

### 3. Scoring Rules

Score at KR level. Do not score only at O level.

Recommended scale:

- `100`: KR target fully met with independent evidence.
- `80`: mostly met; minor gaps remain.
- `60`: partially met; core outcome is incomplete or weakly evidenced.
- `40`: limited progress; important outcome missing.
- `20`: minimal evidence of progress.
- `0`: no evidence, contradicted evidence, or not attempted.

The base score must be based on independent evidence, not on self-reported progress.

### 4. Time Discount

Compare actual completion time with the KR required time.

- If the KR was completed after the required time, apply a 50% discount to the evidence-based base score.
- Formula: `final_score = base_score * 0.5`.
- If only part of the KR was completed late, apply the discount to the late portion when the evidence allows separation; otherwise apply it to the whole KR and explain why.
- If the KR is still incomplete after the deadline, score the actual completed evidence first, then apply the same 50% late discount to the completed portion if it arrived late.
- If no required time can be established, do not apply a time discount; mark `time_discount=未适用`.

Examples:

- Base score `80`, completed after deadline -> final score `40`.
- Base score `60`, no clear deadline -> final score `60`.
- Base score `0`, no evidence -> final score `0`.

### 5. CEO Review Lens

For each KR, evaluate:

- whether the KR's measurable target was actually achieved
- whether the output was delivered by the required time
- whether the result created business, customer, delivery, product, team, or operational value
- whether the evidence shows durable completion rather than a demo, draft, or intent
- whether the work is reusable, adopted, shipped, paid, accepted, or otherwise externally validated when the KR implies those outcomes

### 6. Output Format

Create a review artifact as Markdown and/or Excel. Use one row per KR.

Required columns:

| Person | O | KR | KR Weight | Self Progress | KR Progress Notes | Evidence Used | Evidence Gaps | Deadline | Actual Completion Time | Base Score | Time Discount | Final Score | CEO Comment | Suggested Follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

Rules:

- `Evidence Used` must cite concrete local file paths, memory result summaries, or `dws` source identifiers/URLs when available.
- `Evidence Gaps` must say what is missing, not just "insufficient".
- `CEO Comment` should be direct and evidence-bound.
- `Suggested Follow-up` should name the specific proof, delivery, owner, or next decision needed.
- If evidence is weak, say so and keep the score conservative.

## Chrome Collection Notes

Use the Chrome plugin/browser client when available. Keep updates concise while collecting many profiles.

Important details from the working run:

- `#/report` showed the period and cockpit metrics.
- `100 条/页` gave the stable full people table.
- The `data-row-key` changed across refreshes, so do not use it as `profileUserId`.
- Some zero-objective users may not have details. Record them as `暂无数据`, not as extraction failures.
- The cockpit top-level target count can differ from the by-person table total; keep that in `Data Quality`.

## Reporting Back

For export tasks, include:

- short summary of rows collected and workbook sheets
- data-quality caveats, especially count mismatches or no-detail users
- standalone Markdown link to the final `.xlsx`

For CEO review tasks, include:

- final review artifact path
- number of KRs reviewed
- number of KRs with sufficient independent evidence
- number of KRs discounted for missed timing
- strongest evidence gaps requiring Derek's judgment

Do not paste raw OKR content into chat unless the user explicitly asks.
