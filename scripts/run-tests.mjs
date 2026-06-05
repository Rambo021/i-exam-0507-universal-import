import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const JsZip = require("jszip");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ZIP = path.join(ROOT, "AI考试附件.zip");
const DEMO_DIR = path.join(ROOT, "tmp-safe-demos");
const BASE = "http://localhost:3001";

// ── setup ──────────────────────────────────────────────────────────────────

async function extractZip() {
  // Check if already extracted (has actual files, not just empty dir)
  const hasFiles = fs.existsSync(DEMO_DIR) &&
    fs.readdirSync(DEMO_DIR).some(f => f.endsWith(".xlsx") || f.endsWith(".pdf"));
  if (hasFiles) return;
  if (!fs.existsSync(ZIP)) { console.error("FATAL: AI考试附件.zip not found"); process.exit(1); }
  fs.mkdirSync(DEMO_DIR, { recursive: true });
  const zip = await JsZip.loadAsync(fs.readFileSync(ZIP));
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir || name.includes("__MACOSX") || name.includes(".DS_Store")) continue;
    const filename = path.basename(name);
    if (!filename.endsWith(".xlsx") && !filename.endsWith(".xls") && !filename.endsWith(".pdf")) continue;
    const buf = await entry.async("nodebuffer");
    fs.writeFileSync(path.join(DEMO_DIR, filename), buf);
    console.log(`  extracted: ${filename}`);
  }
}

function findDemo(keyword) {
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      if (fs.statSync(full).isDirectory()) { const r = walk(full); if (r) return r; }
      else if (f.includes(keyword)) return full;
    }
    return null;
  };
  const r = walk(DEMO_DIR);
  if (!r) throw new Error(`Demo file not found for keyword: "${keyword}"`);
  return r;
}

async function checkServer() {
  try {
    const r = await fetch(`${BASE}/api/rules`);
    if (!r.ok && r.status !== 200) throw new Error(`status ${r.status}`);
  } catch (e) {
    console.error(`FATAL: server not reachable at ${BASE} — ${e.message}`);
    console.error("Please start the server: npm run dev -- -p 3001");
    process.exit(1);
  }
}

// ── http helpers ───────────────────────────────────────────────────────────

async function postJson(endpoint, body) {
  const r = await fetch(`${BASE}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}

async function uploadFile(endpoint, filePath) {
  const form = new FormData();
  const bytes = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase().slice(1);
  const mime = ext === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  form.append("file", new Blob([bytes], { type: mime }), path.basename(filePath));
  const r = await fetch(`${BASE}${endpoint}`, { method: "POST", body: form });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}

// ── assertions + runner ────────────────────────────────────────────────────

const results = [];

function assert(cond, msg) { if (!cond) throw new Error(msg); }

async function run(id, name, fn) {
  try {
    const info = await fn();
    results.push({ id, name, pass: true, info: info ?? "" });
    console.log(`  PASS  ${id}  ${name}${info ? "  — " + info : ""}`);
  } catch (e) {
    results.push({ id, name, pass: false, error: e.message });
    console.log(`  FAIL  ${id}  ${name}  — ${e.message}`);
  }
}

// ── minimal valid rule builders ────────────────────────────────────────────

const baseOutput = {
  order: { storeName: { source: "header", header: "门店" } },
  item: {
    skuCode:  { source: "header", header: "SKU编码" },
    skuName:  { source: "header", header: "品名" },
    quantity: { source: "header", header: "数量" },
  },
};

function tableRule(name, extra = {}) {
  return { name, fileTypes: ["xlsx"], version: 1, description: "",
    parser: { mode: "table", headerRow: 0, dataStartRow: 1, dataEndStrategy: "untilEmpty", ...extra },
    output: baseOutput };
}

// ── test cases ─────────────────────────────────────────────────────────────

async function tcA() {
  const file = findDemo("欢乐牧场");
  const { status, data } = await uploadFile("/api/files/analyze", file);
  assert(status === 200, `status ${status}`);
  assert(data.summary && data.parsedFile, "missing summary or parsedFile");
  assert(Array.isArray(data.parsedFile.sheets) && data.parsedFile.sheets.length >= 1, "no sheets");
  const sheet = data.parsedFile.sheets[0];
  // parsedFile.sheets use "rows" field; summary.sheets use "previewRows"
  const rowData = sheet.rows ?? sheet.previewRows;
  assert(Array.isArray(rowData) && rowData.length > 0, "sheet has no rows");
  const summarySheet = data.summary?.sheets?.[0];
  assert(!summarySheet || Array.isArray(summarySheet.previewRows), "summary.sheets[0].previewRows not array");
  return `sheets=${data.parsedFile.sheets.length}, rows=${rowData.length}`;
}

async function tcB() {
  const file = findDemo("湖南仓");
  const { data: analyzed } = await uploadFile("/api/files/analyze", file);
  assert(analyzed.parsedFile, "analyze failed");
  const rule = tableRule("tc-b-table");
  const { status, data } = await postJson("/api/import/parse", { parsedFile: analyzed.parsedFile, rule });
  assert(status !== 500, `server error: ${JSON.stringify(data)}`);
  assert(status === 200, `status ${status}: ${data.error}`);
  assert(Array.isArray(data.rows), "rows not array");
  assert(typeof data.parseDurationMs === "number", "parseDurationMs missing");
  return `rows=${data.rows.length}, ${data.parseDurationMs}ms`;
}

async function tcC() {
  const file = findDemo("多门店");
  const { data: analyzed } = await uploadFile("/api/files/analyze", file);
  assert(analyzed.parsedFile, "analyze failed");
  const rule = { name: "tc-c-multisheet", fileTypes: ["xlsx"], version: 1, description: "",
    parser: { mode: "multiSheetTable", headerRow: 0, dataStartRow: 1, dataEndStrategy: "untilEmpty", sheetAsStoreName: true },
    output: baseOutput };
  const { status, data } = await postJson("/api/import/parse", { parsedFile: analyzed.parsedFile, rule });
  assert(status !== 500, `server error: ${JSON.stringify(data)}`);
  assert(status === 200, `status ${status}: ${data.error}`);
  assert(Array.isArray(data.rows), "rows not array");
  return `rows=${data.rows.length}, sheets=${analyzed.parsedFile.sheets?.length ?? "?"}`;
}

async function tcD() {
  const file = findDemo("卡片式");
  const { data: analyzed } = await uploadFile("/api/files/analyze", file);
  assert(analyzed.parsedFile, "analyze failed");
  const rule = { name: "tc-d-cardlist", fileTypes: ["xlsx"], version: 1, description: "",
    parser: {
      mode: "cardList",
      boundary: { type: "regex", pattern: "门店|调拨" },
      headerExtractors: { storeName: { source: "textBlock", pattern: "门店[：:]?\\s*(.+)" } },
      itemTable: { headerRowOffset: 0, dataStartOffset: 1 },
    },
    output: {
      order: { storeName: { source: "extracted", key: "storeName" } },
      item: {
        skuCode:  { source: "header", header: "SKU编码" },
        skuName:  { source: "header", header: "品名" },
        quantity: { source: "header", header: "数量" },
      },
    },
  };
  const { status, data } = await postJson("/api/import/parse", { parsedFile: analyzed.parsedFile, rule });
  assert(status !== 500, `server error: ${JSON.stringify(data)}`);
  assert(status === 200, `status ${status}: ${data.error}`);
  assert(Array.isArray(data.rows), "rows not array");
  return `rows=${data.rows.length}`;
}

async function tcE() {
  const row = { id: "te1", externalCode: "", storeName: "", receiverName: "", receiverPhone: "", receiverAddress: "", skuCode: "SKU001", skuName: "测试品", quantity: "1", spec: "", remark: "" };
  const { status, data } = await postJson("/api/orders/import", { rows: [row] });
  if (status === 503) return "SKIP (no DB)";
  assert(status === 400, `expected 400, got ${status}`);
  assert(typeof data.error === "string" && data.error.length > 0, "error message missing");
  return `error="${data.error}"`;
}

async function tcF() {
  const row = { id: "tf1", externalCode: "", storeName: "test-store", receiverName: "", receiverPhone: "", receiverAddress: "", skuCode: "SKU001", skuName: "测试品", quantity: "-1", spec: "", remark: "" };
  const { status, data } = await postJson("/api/orders/import", { rows: [row] });
  if (status === 503) return "SKIP (no DB)";
  assert(status === 400, `expected 400 for quantity=-1, got ${status}`);
  return `error="${data.error}"`;
}

async function tcG() {
  const rule = tableRule("tc-g-crud");
  const { data: created } = await postJson("/api/rules", { rule });
  assert(typeof created.rule?.id === "string", "rule.id missing");
  const id = created.rule.id;
  if (!created.databaseReady) return "SKIP (no DB) — rule created in-memory";
  await fetch(`${BASE}/api/rules/${id}`, { method: "DELETE" });
  const r = await fetch(`${BASE}/api/rules/${id}`);
  assert(r.status === 404, `GET after DELETE should be 404, got ${r.status}`);
  return `id=${id} deleted → 404`;
}

async function tcH() {
  const row = { id: "th1", externalCode: "TC-H-001", storeName: "test-store", receiverName: "", receiverPhone: "", receiverAddress: "", skuCode: "TEST001", skuName: "测试品", quantity: "1", spec: "", remark: "" };
  const { status: s, data: imp } = await postJson("/api/orders/import", { rows: [row], fileName: "test-tc-h.xlsx" });
  if (s === 503) return "SKIP (no DB)";
  assert(s === 200, `import status ${s}: ${imp.error}`);
  assert(typeof imp.batchId === "string", "batchId missing");
  const { data: orders } = await fetch(`${BASE}/api/orders`).then(r => r.json().then(d => ({ data: d })));
  if (!orders.databaseReady) return "SKIP (no DB)";
  assert(Array.isArray(orders.rows) && orders.rows.length >= 1, "orders empty after import");
  return `batchId=${imp.batchId}, ordersTotal=${orders.total}`;
}

// ── main ───────────────────────────────────────────────────────────────────

console.log("Extracting demo files...");
await extractZip();
console.log("Checking server...");
await checkServer();
console.log(`\nRunning tests against ${BASE}\n`);

await run("TC-A", "文件分析 (欢乐牧场)", tcA);
await run("TC-B", "规则引擎 table 模式 (湖南仓)", tcB);
await run("TC-C", "规则引擎 multiSheetTable (多门店分Sheet)", tcC);
await run("TC-D", "规则引擎 cardList (卡片式调拨单)", tcD);
await run("TC-E", "校验 — storeName+收件人均空 → 400", tcE);
await run("TC-F", "校验 — quantity=-1 → 400", tcF);
await run("TC-G", "规则 CRUD + 软删除", tcG);
await run("TC-H", "订单入库 + 查询 (需 DB)", tcH);

console.log("\n── SUMMARY ─────────────────────────────────────────────────────");
for (const r of results) {
  const mark = r.pass ? "PASS" : "FAIL";
  console.log(`  ${mark}  ${r.id}  ${r.name}`);
  if (!r.pass) console.log(`        ${r.error}`);
}
const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed > 0 ? 1 : 0);
