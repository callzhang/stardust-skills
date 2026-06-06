---
name: dingdang-okr-export
description: Use when the user asks to pull, review, audit, export, or summarize 叮当OKR objectives, KR progress, people progress reports, Q2/Q3/Q4 OKR data, or asks to organize 叮当OKR data into Excel, especially when the 叮当OKR web app is already open in Chrome.
---

# Dingdang OKR Export

Use this skill to turn the 叮当OKR web UI into a local `.xlsx` workbook with one worksheet per person, hierarchical Objective/KR rows, weights, progress, raw visible text, and data-quality notes.

This skill is for 叮当OKR (`https://dingokr.dingteam.com/...`), not DingTalk OA reports or DingTalk documents.

## Operating Boundaries

- Use the user's logged-in Chrome tab when the 叮当OKR page is already open.
- Current Chrome-based export does not require DingTalk Open Platform AppKey/AppSecret. It requires the browser user to be logged in and authorized to view the target OKR data.
- Do not inspect Chrome cookies, localStorage, browser profile files, passwords, or session stores.
- Do not print tokens, secrets, cookies, or authorization headers.
- Do not read local OKR/source files when the user asks to pull from 叮当 OKR; the source of truth is the online page/API visible through Chrome.
- If a first-class `dws okr` command exists in the current environment, prefer it for API extraction. In that mode, follow `dws` authentication and enterprise permission requirements. If not, use the Chrome UI workflow below.
- If the user asks for scoring or review, first export the OKR workbook; then combine with allowed local memory/meeting material only if the user explicitly permits that additional context.

## Expected Output

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

## Workflow

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
   - Also map progress-change rows to KR details when the record `ref` exactly or unambiguously matches a KR title from the same objective. These rows usually contain `状态`, `进度`, and `说明`, and are the main source for "why this progress" evidence.
   - Keep objective-level replies, new-objective/new-KR events, or ambiguous records separately as unscoped records; do not attach them to a KR unless the record has a clear `评论KR` reference or an unambiguous KR-title match.
   - Return to `#/report`, ensure `100 条/页`, and continue.

5. Normalize the capture into raw JSON:

```json
{
  "generatedAt": "ISO timestamp",
  "source": {
    "system": "叮当OKR",
    "url": "...#/report",
    "period": "2026年2季度",
    "periodRange": "2026/03/31-2026/06/30",
    "cockpitTargetCount": 253,
    "cockpitAverageProgress": "31.48%",
    "cockpitWeeklyChange": "8.64%",
    "cockpitTaskCount": 0,
    "cockpitTaskCompletionRate": "0%"
  },
  "people": [],
  "profiles": [],
  "krUpdates": []
}
```

`krUpdates` is optional. If present, use rows shaped like:

```json
{
  "profileUserId": "0125200555401244265",
  "objectiveCode": "O1",
  "krCode": "KR1",
  "updates": [
    {
      "time": "2026-06-01 10:00",
      "author": "Roy Han",
      "progress": "40%",
      "content": "progress note"
    }
  ]
}
```

Progress-note extraction details:

- On a profile page, clicking an objective or KR opens a bottom `目标详情` drawer.
- The drawer's `关键结果` tab lists KR details, but the useful progress explanations are normally in the right-side/bottom `所有记录（n）` list.
- KR-specific notes can appear in two forms:
  - comment items with a reference block like `评论KR <KR title>...` and a separate comment body
  - progress-change items whose `ref` is the KR title and whose body contains `状态`, `进度`, and `说明`
- Use the reference block or exact/unambiguous KR-title match to map the note to the KR.
- Some records are objective-level replies, mentions, or replies to another comment. Store them as unscoped objective records rather than guessing a KR mapping.
- Treat these records as self/comment evidence from OKR, not independent completion proof. They are useful for review leads and later verification.

6. Build the workbook with the bundled script:

```bash
node /Users/derek/.agents/skills/dingdang-okr-export/scripts/build_workbook.mjs \
  --input /absolute/path/to/dingteam_okr_2026q2_raw.json \
  --output-dir /absolute/path/to/outputs/dingteam-okr-2026q2 \
  --period-label 2026年2季度 \
  --period-slug 2026q2
```

7. Verify the `.xlsx` before reporting completion.
   - Import the workbook using `@oai/artifact-tool`.
   - Inspect workbook/sheet/table overview.
   - Check that `People Overview` has one header row plus all people.
   - Check that the total `Level = O` rows across person tabs equals the sum of by-person objective counts, excluding explicit no-detail zero-OKR rows.
   - Check that person tabs exist for every person row.
   - Scan for `#REF!`, `#DIV/0!`, `#VALUE!`, `#NAME?`, `#N/A`.

## Chrome Collection Notes

Use the Chrome plugin/browser client when available. Keep updates concise while collecting many profiles.

Important details from the working run:

- `#/report` showed the period and cockpit metrics.
- `100 条/页` gave the stable full people table.
- The `data-row-key` changed across refreshes, so do not use it as `profileUserId`.
- Some zero-objective users may not have details. Record them as `暂无数据`, not as extraction failures.
- The cockpit top-level target count can differ from the by-person table total; keep that in `Data Quality`.

## Suggested Browser REPL Extraction Shape

Use this as a shape, adapting selectors as the UI changes:

```js
const reportUrl = "https://dingokr.dingteam.com/web/okr/pc/index.html?...#/report";

async function ensureReportPage100(tab) {
  if (!location.href.includes("#/report")) await tab.goto(reportUrl);
  // Open the page-size selector and choose 100 条/页 when not already selected.
}

async function readPeople(tab) {
  return await tab.playwright.evaluate(() =>
    [...document.querySelectorAll("tr.ant-table-row")].map((tr, idx) => {
      const cells = [...tr.querySelectorAll("td")].map((td) =>
        td.innerText.trim().replace(/\s+/g, " ")
      );
      return {
        index: idx + 1,
        name: cells[0],
        dept: cells[1],
        objectiveCount: cells[2],
        confirmingCount: cells[3],
        alignedCount: cells[4],
        unalignedCount: cells[5],
        rawText: tr.innerText.trim()
      };
    }).filter((row) => row.name)
  );
}

async function collectProfile(tab, rowIndex) {
  await ensureReportPage100(tab);
  await tab.playwright.locator("tr.ant-table-row").nth(rowIndex).click({ timeout: 15000 });
  await tab.playwright.waitForTimeout(1800);
  return await tab.playwright.evaluate(() => {
    const text = (document.body.innerText || "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n");
    const match = location.href.match(/profileUserId=([^&]+)/);
    return {
      profileUserId: match ? match[1] : "",
      profileUrl: location.href,
      profileText: text,
      profileTextLength: text.length
    };
  });
}
```

## Reporting Back

Final response should include:

- short summary of rows collected and workbook sheets
- data-quality caveats, especially count mismatches or no-detail users
- standalone Markdown link to the final `.xlsx`

Do not paste raw OKR content into chat unless the user explicitly asks.
