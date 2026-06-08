---
name: dingtang-okr-review
description: Use when the user asks to export, review, audit, score, or summarize 叮当OKR/Dingtang OKR objectives, KR progress, CEO OKR review, people progress reports, Q2/Q3/Q4 OKR data, or asks to organize OKR data into Excel and evaluate KR completion with evidence.
---

# Dingtang OKR Review

Use this skill for two related workflows:

1. Export 叮当OKR data into a verified workbook.
2. Perform CEO-level OKR review at KR level using independent evidence.

This skill is for 叮当OKR (`https://dingokr.dingteam.com/...`), not DingTalk OA reports or DingTalk documents.

## Operating Boundaries

- Use the user's logged-in Chrome tab when the 叮当OKR page is already open.
- Current Chrome-based export does not require DingTalk Open Platform AppKey/AppSecret. It requires the browser user to be logged in and authorized to view the target OKR data.
- Do not inspect Chrome cookies, localStorage, browser profile files, passwords, or session stores.
- Do not print tokens, secrets, cookies, or authorization headers.
- Do not read local OKR/source files when the user asks to pull from 叮当 OKR; the source of truth is the online page/API visible through Chrome.
- If a first-class `dws okr` command exists in the current environment, prefer it for API extraction. In that mode, follow `dws` authentication and enterprise permission requirements. If not, use the Chrome UI workflow below.
- For review/scoring, first export or load the OKR workbook, then use only user-authorized evidence sources: local files, `memory_recall`, and `dws` search/read commands.

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

2. Check whether `dws` has native OKR support:

```bash
dws --help
dws okr --help
```

If OKR is not listed as a service, continue with Chrome.

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
