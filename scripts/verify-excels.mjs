import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

const testDir = path.resolve("test-excels");

const orderFields = [
  "externalCode",
  "senderName",
  "senderPhone",
  "senderAddress",
  "receiverName",
  "receiverPhone",
  "receiverAddress",
  "weight",
  "quantity",
  "temperatureZone",
  "remark",
];

const aliases = {
  externalCode: ["外部编码", "外部订单号", "客户单号", "refcode", "ref code", "reference", "orderid"],
  senderName: ["发件人姓名", "发件人", "发货人", "寄件人", "sender"],
  senderPhone: ["发件人电话", "发件电话", "发货电话", "寄件电话", "sendertel", "sender tel", "senderphone"],
  senderAddress: ["发件人地址", "发件地址", "发货地址", "寄件地址", "senderaddress", "sender address"],
  receiverName: ["收件人姓名", "收件人", "收货人", "收方", "receiver", "recipient"],
  receiverPhone: ["收件人电话", "收件电话", "收货电话", "receiver tel", "receivertel", "receiverphone"],
  receiverAddress: ["收件人地址", "收件地址", "收货地址", "receiver address", "receiveraddress"],
  weight: ["重量", "重量kg", "重量(kg)", "重量（kg）", "weight", "weightkg", "weight(kg)"],
  quantity: ["件数", "数量", "qty", "quantity", "包裹数量"],
  temperatureZone: ["温层", "温度要求", "tempzone", "temp zone", "temperature"],
  remark: ["备注", "附言", "note", "remark", "memo"],
};

const requiredFields = orderFields.filter((field) => field !== "externalCode" && field !== "remark");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function normalizeHeader(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[（）]/g, "")
    .replace(/（/g, "(")
    .replace(/）/g, ")");
}

function scoreHeader(value, field) {
  const normalized = normalizeHeader(value);
  if (!normalized) return 0;
  return aliases[field].some((item) => normalizeHeader(item) === normalized) ? 1 : 0;
}

function findAddressParts(headers, side) {
  const sideWords = side === "sender" ? ["发件", "发货", "寄件", "寄方", "sender"] : ["收件", "收货", "收方", "receiver", "recipient"];
  const partWords = ["省", "市", "区", "县", "详细地址", "地址明细", "address"];

  return headers
    .map((header, index) => ({ header: String(header ?? ""), normalized: normalizeHeader(header), index }))
    .filter(({ header, normalized }) => {
      const hasSide = sideWords.some((word) => normalized.includes(normalizeHeader(word)) || header.includes(word));
      const hasPart = partWords.some((word) => normalized.includes(normalizeHeader(word)) || header.includes(word));
      return hasSide && hasPart;
    })
    .map((item) => item.index);
}

function inferMapping(headers) {
  const mapping = {};
  const usedColumns = new Set();

  for (const field of orderFields) {
    let bestIndex = -1;
    let bestScore = 0;
    headers.forEach((header, index) => {
      if (usedColumns.has(index)) return;
      const score = scoreHeader(header, field);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    if (bestIndex >= 0) {
      mapping[field] = bestIndex;
      usedColumns.add(bestIndex);
    }
  }

  const senderAddressParts = findAddressParts(headers, "sender");
  const receiverAddressParts = findAddressParts(headers, "receiver");
  if (mapping.senderAddress === undefined && senderAddressParts.length >= 2) {
    mapping.senderAddress = senderAddressParts;
  }
  if (mapping.receiverAddress === undefined && receiverAddressParts.length >= 2) {
    mapping.receiverAddress = receiverAddressParts;
  }

  return mapping;
}

function mappingScore(mapping) {
  const requiredHits = requiredFields.filter((field) => mapping[field] !== undefined).length;
  const allHits = orderFields.filter((field) => mapping[field] !== undefined).length;
  return requiredHits * 4 + allHits;
}

function fingerprintHeaders(headers) {
  const normalized = headers.map(normalizeHeader).filter(Boolean).join("|");
  let hash = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash << 5) - hash + normalized.charCodeAt(index);
    hash |= 0;
  }
  return `${Math.abs(hash)}-${normalized.length}`;
}

function similarity(left, right) {
  const leftSet = new Set(left.map(normalizeHeader).filter(Boolean));
  const rightSet = new Set(right.map(normalizeHeader).filter(Boolean));
  if (!leftSet.size || !rightSet.size) return 0;
  let hit = 0;
  leftSet.forEach((value) => {
    if (rightSet.has(value)) hit += 1;
  });
  return hit / Math.max(leftSet.size, rightSet.size);
}

function selectSheet(workbook) {
  const candidates = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, blankrows: false });
    let best = { sheetName, headerRowIndex: -1, headers: [], mapping: {}, score: -1, matrix };

    matrix.slice(0, 10).forEach((row, index) => {
      const mapping = inferMapping(row);
      const score = mappingScore(mapping);
      if (score > best.score) {
        best = {
          sheetName,
          headerRowIndex: index,
          headers: row.map((cell) => String(cell ?? "").trim()),
          mapping,
          score,
          matrix,
        };
      }
    });

    return best;
  });

  return candidates.sort((a, b) => b.score - a.score)[0];
}

function readMappedCell(row, index) {
  if (index === undefined) return "";
  if (Array.isArray(index)) {
    return index
      .map((item) => String(row[item] ?? "").trim())
      .filter(Boolean)
      .join("");
  }
  return String(row[index] ?? "").trim();
}

function parseWorkbook(fileName, savedMappings = []) {
  const workbook = XLSX.read(fs.readFileSync(path.join(testDir, fileName)), { cellDates: false });
  const selected = selectSheet(workbook);
  assert(selected.score >= 20, `${fileName}: failed to detect a valid header`);

  const fingerprint = fingerprintHeaders(selected.headers);
  const exact = savedMappings.find((item) => item.fingerprint === fingerprint);
  const similar = savedMappings
    .map((item) => ({ item, score: similarity(selected.headers, item.headers) }))
    .sort((a, b) => b.score - a.score)[0];
  const remembered = exact ?? (similar?.score >= 0.8 ? similar.item : null);
  const mapping = remembered?.mapping ?? selected.mapping;
  const sourceRows = selected.matrix
    .slice(selected.headerRowIndex + 1)
    .filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""));
  const rows = sourceRows.map((row) =>
    Object.fromEntries(orderFields.map((field) => [field, readMappedCell(row, mapping[field])])),
  );

  return {
    fileName,
    selected,
    fingerprint,
    mapping,
    rows,
    fromMemory: Boolean(remembered),
    similarity: remembered && !exact ? similar.score : 1,
  };
}

const cases = [
  ["case1-standard-header-row1.xlsx", { sheetName: "订单导入", headerRowIndex: 0, rows: 5 }],
  ["case2-ecommerce-title-merged.xlsx", { sheetName: "Sheet1", headerRowIndex: 2, rows: 5 }],
  ["case3-english-reordered.xlsx", { sheetName: "Import", headerRowIndex: 0, rows: 5 }],
  ["case4-grouped-two-level.xlsx", { sheetName: "批量下单", headerRowIndex: 1, rows: 5 }],
  ["case5-multisheet-split-address-missing-optional.xlsx", { sheetName: "订单数据", headerRowIndex: 0, rows: 5 }],
  ["case6-large-1005-rows.xlsx", { sheetName: "大批量订单", headerRowIndex: 0, rows: 1005 }],
];

for (const [fileName, expected] of cases) {
  const start = performance.now();
  const result = parseWorkbook(fileName);
  const elapsed = Math.round(performance.now() - start);
  assert(result.selected.sheetName === expected.sheetName, `${fileName}: sheet mismatch`);
  assert(result.selected.headerRowIndex === expected.headerRowIndex, `${fileName}: header row mismatch`);
  assert(result.rows.length === expected.rows, `${fileName}: row count mismatch`);
  for (const field of requiredFields) {
    assert(result.mapping[field] !== undefined, `${fileName}: required field ${field} not mapped`);
    assert(result.rows[0][field], `${fileName}: first row ${field} is empty`);
  }
  console.log(`PASS ${fileName}: ${result.rows.length} rows, ${elapsed}ms`);
}

const base = parseWorkbook("case1-standard-header-row1.xlsx");
const memory = [{ fingerprint: base.fingerprint, headers: base.selected.headers, mapping: base.mapping }];
const similar = parseWorkbook("case7-similar-memory-template.xlsx", memory);
assert(similar.fromMemory, "case7: similar template did not apply saved mapping");
assert(similar.similarity >= 0.8, "case7: similarity below threshold");
assert(similar.rows[0].remark === "易碎品", "case7: remembered remark mapping was not applied");
console.log(`PASS case7-similar-memory-template.xlsx: memory similarity ${similar.similarity.toFixed(2)}`);
