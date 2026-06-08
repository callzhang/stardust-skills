#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

const args = parseArgs(process.argv);
if (!args.input || !args["output-dir"]) {
  console.error("Usage: build_workbook.mjs --input raw.json --output-dir outputs/dingteam-okr-2026q2 [--period-label 2026年2季度] [--period-slug 2026q2]");
  process.exit(2);
}

const inputPath = path.resolve(args.input);
const outputDir = path.resolve(args["output-dir"]);
const periodSlug = String(args["period-slug"] || "period").replace(/[^a-zA-Z0-9_-]/g, "");
const outputPath = path.join(outputDir, `dingteam_okr_${periodSlug}.xlsx`);
const previewPath = path.join(outputDir, `dingteam_okr_${periodSlug}_summary.png`);

const raw = JSON.parse(await fs.readFile(inputPath, "utf8"));
const usedSheetNames = new Set();

function normalizeText(value) {
  return String(value ?? "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

function qPeriodText(profileText, periodLabel) {
  const text = normalizeText(profileText);
  const label = periodLabel || raw.source?.period || "";
  const start = label ? text.indexOf(label) : -1;
  if (start < 0) return "";
  const nextQuarter = text.slice(start + label.length).search(/\d{4}年[1-4]季度/);
  const end = nextQuarter >= 0 ? start + label.length + nextQuarter : undefined;
  return text.slice(start, end).trim();
}

function firstMatch(text, pattern) {
  const match = text.match(pattern);
  return match ? match[1] : "";
}

function parsePerson(profile) {
  const text = qPeriodText(profile.profileText, args["period-label"]);
  return {
    ...profile,
    periodText: text || normalizeText(profile.profileText),
    periodTargetCount: Number(firstMatch(text, /目标数：\n(\d+)/)) || Number(profile.objectiveCount || 0),
    periodProgress: firstMatch(text, /进度：\n([\d.]+%)/) || "",
  };
}

function extractSections(text) {
  const normalized = normalizeText(text);
  const byAlign = normalized.split(/添加对齐\n\n/).slice(1);
  const cardSections = byAlign
    .map((section) => section.trim())
    .filter((section) => /\nO\d+\n进度\n权重/.test(`\n${section}`) || /^O\d+：/.test(section));
  if (cardSections.length) return cardSections;

  const lines = normalized.split("\n");
  const starts = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (/^O\d+：/.test(line) || line === "文化价值观考核" || line === "领导力考核") {
      starts.push(i);
    }
  }
  return starts.map((start, i) => {
    const end = i + 1 < starts.length ? starts[i + 1] : lines.length;
    return lines.slice(start, end).join("\n").trim();
  });
}

function parseObjectiveSection(section, person) {
  const lines = section.split("\n").map((line) => line.trim()).filter(Boolean);
  const codeLineIndex = lines.findIndex((line) => /^O\d+$/.test(line));
  const titleCandidates = [];
  const titleEnd = codeLineIndex >= 0 ? codeLineIndex : lines.length;
  for (let i = 0; i < titleEnd; i += 1) {
    const line = lines[i];
    if (line === person.dept || line === person.name || line === "个人级" || /^[\d.]+%$/.test(line)) {
      break;
    }
    titleCandidates.push(line);
  }
  const titleLine = titleCandidates.join("\n") || lines[0] || "";
  const objectiveCode =
    firstMatch(titleLine, /^(O\d+)：/) ||
    firstMatch(section, /\n(O\d+)\n进度\n权重/) ||
    "";
  const metrics = section.match(/进度\n权重\n([\d.]+%)\n([\d.]+%)/);
  return {
    personName: person.name,
    dept: person.dept,
    profileUserId: person.profileUserId || "",
    objectiveCode,
    objectiveTitle: titleLine.replace(/^O\d+：/, "").trim(),
    objectiveProgress: metrics ? metrics[1] : "",
    objectiveWeight: metrics ? metrics[2] : "",
    rawObjectiveText: section,
  };
}

function parseKrs(section, objective) {
  const regex = /KR(\d+)：\n([\s\S]*?)(?=\nKR\d+：|$)/g;
  const rows = [];
  let match;
  while ((match = regex.exec(section)) !== null) {
    const rawKr = match[2].trim();
    const percentages = [...rawKr.matchAll(/(^|\n)([\d.]+%)\n([\d.]+%)(?=\n|$)/g)];
    const last = percentages.at(-1);
    let content = rawKr;
    let krProgress = "";
    let krWeight = "";
    if (last) {
      krProgress = last[2];
      krWeight = last[3];
      content = rawKr.slice(0, last.index).trim();
    }
    rows.push({
      ...objective,
      krCode: `KR${match[1]}`,
      krContent: content,
      krProgress,
      krWeight,
    });
  }
  return rows;
}

const people = (raw.profiles || []).map(parsePerson);
const objectives = [];
const krs = [];
const personSections = new Map();
for (const person of people) {
  const sections = extractSections(person.periodText);
  personSections.set(person.profileUserId || `${person.index || ""}:${person.name}`, sections);
  for (const section of sections) {
    const objective = parseObjectiveSection(section, person);
    objectives.push(objective);
    krs.push(...parseKrs(section, objective));
  }
}

const workbook = Workbook.create();

function uniqueSheetName(rawName) {
  const cleaned = String(rawName || "Sheet")
    .replace(/[\[\]\*\/\\\?:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31) || "Sheet";
  let name = cleaned;
  let suffix = 2;
  while (usedSheetNames.has(name)) {
    const tail = `_${suffix}`;
    name = `${cleaned.slice(0, 31 - tail.length)}${tail}`;
    suffix += 1;
  }
  usedSheetNames.add(name);
  return name;
}

function addSheet(name, rows, headerFill = "#2563EB") {
  const sheet = workbook.worksheets.add(uniqueSheetName(name));
  if (!rows.length) return sheet;
  const width = rows[0].length;
  const height = rows.length;
  sheet.getRangeByIndexes(0, 0, height, width).values = rows;
  sheet.getRangeByIndexes(0, 0, 1, width).format = {
    fill: headerFill,
    font: { bold: true, color: "#FFFFFF" },
  };
  return sheet;
}

function formatUpdate(update) {
  if (typeof update === "string") return update;
  if (!update || typeof update !== "object") return "";
  const parts = [];
  if (update.time) parts.push(update.time);
  if (update.author) parts.push(update.author);
  if (update.progress) parts.push(`progress=${update.progress}`);
  if (update.content) parts.push(update.content);
  if (update.detail) parts.push(update.detail);
  return parts.filter(Boolean).join(" | ");
}

function aggregateKrUpdates(person, objectiveCode, krCode) {
  const candidates = raw.krUpdates || raw.kr_updates || raw.updates || [];
  const rows = candidates.filter((row) => {
    const samePerson = !row.profileUserId || row.profileUserId === person.profileUserId;
    const sameObjective = !row.objectiveCode || row.objectiveCode === objectiveCode;
    const sameKr = !row.krCode || row.krCode === krCode;
    return samePerson && sameObjective && sameKr;
  });
  const formatted = rows.flatMap((row) => Array.isArray(row.updates) ? row.updates.map(formatUpdate) : [formatUpdate(row)])
    .filter(Boolean);
  if (formatted.length) return formatted.join("\n---\n");
  const captureAttempted = Boolean(raw.progressCollectionStats || raw.unscopedOkrRecords || raw.unscopedRecords);
  return captureAttempted ? "[未撰写进度]" : "未采集";
}

const source = raw.source || {};
const byPersonTargetCount = (raw.people || []).reduce((sum, row) => sum + Number(row.objectiveCount || 0), 0);

addSheet("Summary", [
  ["Metric", "Value"],
  ["Source", source.system || "叮当OKR"],
  ["Period", source.period || args["period-label"] || ""],
  ["Period Range", source.periodRange || ""],
  ["Generated At", raw.generatedAt || ""],
  ["People Rows", people.length],
  ["Profiles Collected", (raw.profiles || []).length],
  ["Cockpit Target Count", source.cockpitTargetCount ?? ""],
  ["By-Person Objective Total", byPersonTargetCount],
  ["Cockpit Average Progress", source.cockpitAverageProgress || ""],
  ["Weekly Change", source.cockpitWeeklyChange || ""],
  ["Task Count", source.cockpitTaskCount ?? ""],
  ["Task Completion Rate", source.cockpitTaskCompletionRate || ""],
]);

addSheet("People Overview", [
  ["Index", "Name", "Department", "Cockpit Objectives", "Confirming", "Aligned", "Unaligned", "Period Header Objectives", "Period Progress", "Profile User ID", "Profile URL"],
  ...people.map((p, idx) => [
    idx + 1,
    p.name,
    p.dept,
    Number(p.objectiveCount || 0),
    Number(p.confirmingCount || 0),
    Number(p.alignedCount || 0),
    Number(p.unalignedCount || 0),
    p.periodTargetCount,
    p.periodProgress,
    p.profileUserId || "",
    p.profileUrl || "",
  ]),
]);

const noDetail = people.filter((p) => Number(p.objectiveCount || 0) === 0 || !p.profileUserId || !p.periodText.includes(source.period || args["period-label"] || "年"));
addSheet("Data Quality", [
  ["Check", "Result"],
  ["Cockpit objective count", source.cockpitTargetCount ?? ""],
  ["Sum of objectives in by-person table", byPersonTargetCount],
  ["Difference", Number(source.cockpitTargetCount || 0) - byPersonTargetCount],
  ["People with no period OKR detail", noDetail.map((p) => p.name).join(", ") || "None"],
  ["Collection note", "Data was collected from the logged-in 叮当OKR Chrome page. One tab per person retains raw period text and hierarchical O/KR rows."],
  ["KR updates note", (raw.krUpdates || raw.kr_updates || raw.updates) ? "KR update fields were read from raw JSON when matching profileUserId/objectiveCode/krCode. If capture was attempted and no matching KR record exists, person tabs mark it as [未撰写进度]." : "KR detail update history was not present in raw JSON; person tabs mark it as 未采集."],
]);

let personObjectiveRows = 0;
let personKrRows = 0;
for (const [idx, person] of people.entries()) {
  const rows = [
    ["Level", "O", "O Progress", "O Weight", "KR", "KR Progress", "KR Weight", "KR Details Updates (Aggregated)", "Text"],
  ];
  const sections = personSections.get(person.profileUserId || `${person.index || ""}:${person.name}`) || [];
  for (const section of sections) {
    const objective = parseObjectiveSection(section, person);
    const oLabel = `${objective.objectiveCode || ""}${objective.objectiveCode ? ": " : ""}${objective.objectiveTitle}`;
    rows.push([
      "O",
      oLabel,
      objective.objectiveProgress,
      objective.objectiveWeight,
      "",
      "",
      "",
      "",
      objective.rawObjectiveText,
    ]);
    personObjectiveRows += 1;
    const krRows = parseKrs(section, objective);
    for (const kr of krRows) {
      rows.push([
        "KR",
        oLabel,
        objective.objectiveProgress,
        objective.objectiveWeight,
        `${kr.krCode}: ${kr.krContent}`,
        kr.krProgress,
        kr.krWeight,
        aggregateKrUpdates(person, objective.objectiveCode, kr.krCode),
        kr.krContent,
      ]);
      personKrRows += 1;
    }
  }
  if (rows.length === 1) {
    rows.push(["No Data", "", "", "", "", "", "", "未采集", person.periodText || "暂无数据"]);
  }
  const tabName = `${String(idx + 1).padStart(2, "0")}_${person.name}`;
  addSheet(tabName, rows, "#0F766E");
}

await fs.mkdir(outputDir, { recursive: true });
const preview = await workbook.render({ sheetName: "Summary", autoCrop: "all", scale: 1, format: "png" });
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));
const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(outputPath);

console.log(JSON.stringify({
  outputPath,
  previewPath,
  people: people.length,
  objectives: objectives.length,
  krs: krs.length,
  personTabs: people.length,
  personObjectiveRows,
  personKrRows,
  byPersonTargetCount,
}, null, 2));
