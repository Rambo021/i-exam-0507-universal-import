import * as XLSX from "xlsx";
import { nanoid } from "nanoid";
import {
  ColumnMapping,
  MappingDraft,
  OrderField,
  OrderRow,
  ParseResult,
  fieldConfigs,
  orderFields,
} from "./types";

const aliases: Record<OrderField, string[]> = {
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

export function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[：:]/g, "")
    .replace(/（/g, "(")
    .replace(/）/g, ")");
}

function scoreHeader(value: unknown, field: OrderField) {
  const normalized = normalizeHeader(value);
  if (!normalized) return 0;
  return aliases[field].some((item) => normalizeHeader(item) === normalized) ? 1 : 0;
}

function inferMapping(headers: unknown[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const usedColumns = new Set<number>();

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

  return mapping;
}

function mappingScore(mapping: ColumnMapping) {
  const required = fieldConfigs.filter((field) => field.required).map((field) => field.key);
  const requiredHits = required.filter((field) => mapping[field] !== undefined).length;
  const allHits = orderFields.filter((field) => mapping[field] !== undefined).length;
  return requiredHits * 4 + allHits;
}

export function fingerprintHeaders(headers: unknown[]) {
  const normalized = headers.map(normalizeHeader).filter(Boolean).join("|");
  let hash = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash << 5) - hash + normalized.charCodeAt(index);
    hash |= 0;
  }
  return `${Math.abs(hash)}-${normalized.length}`;
}

function similarity(left: string[], right: string[]) {
  const leftSet = new Set(left.map(normalizeHeader).filter(Boolean));
  const rightSet = new Set(right.map(normalizeHeader).filter(Boolean));
  if (!leftSet.size || !rightSet.size) return 0;
  let hit = 0;
  leftSet.forEach((value) => {
    if (rightSet.has(value)) hit += 1;
  });
  return hit / Math.max(leftSet.size, rightSet.size);
}

function getSavedMappings(): MappingDraft[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem("templateMappings") ?? "[]") as MappingDraft[];
  } catch {
    return [];
  }
}

export function saveMapping(mapping: MappingDraft) {
  if (typeof window === "undefined") return;
  const saved = getSavedMappings().filter((item) => item.fingerprint !== mapping.fingerprint);
  window.localStorage.setItem(
    "templateMappings",
    JSON.stringify([{ ...mapping, fromMemory: true }, ...saved].slice(0, 30)),
  );
}

function findSavedMapping(headers: string[], fingerprint: string): Pick<MappingDraft, "mapping" | "fromMemory" | "confidence"> | null {
  const saved = getSavedMappings();
  const exact = saved.find((item) => item.fingerprint === fingerprint);
  if (exact) return { mapping: exact.mapping, fromMemory: true, confidence: 1 };

  const similar = saved
    .map((item) => ({ item, score: similarity(headers, item.headers) }))
    .sort((a, b) => b.score - a.score)[0];

  if (similar && similar.score >= 0.8) {
    return { mapping: similar.item.mapping, fromMemory: true, confidence: similar.score };
  }

  return null;
}

function selectSheet(workbook: XLSX.WorkBook) {
  const candidates = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, blankrows: false });
    let best = { sheetName, headerRowIndex: -1, headers: [] as string[], mapping: {} as ColumnMapping, score: -1, matrix };

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

function emptyRow(): OrderRow {
  return Object.fromEntries(orderFields.map((field) => [field, ""])) as OrderRow;
}

function rowToOrder(row: unknown[], mapping: ColumnMapping): OrderRow {
  const order = emptyRow();
  order.id = nanoid(8);
  for (const field of orderFields) {
    const index = mapping[field];
    order[field] = index === undefined ? "" : String(row[index] ?? "").trim();
  }
  return order;
}

export async function parseExcelFile(
  file: File,
  onProgress?: (processed: number, total: number) => void,
): Promise<ParseResult> {
  if (!/\.(xlsx|xls)$/i.test(file.name)) {
    throw new Error("仅支持 .xlsx / .xls 文件");
  }

  const data = await file.arrayBuffer();
  if (data.byteLength === 0) {
    throw new Error("文件为空或没有可读取数据");
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(data, { type: "array", cellDates: false });
  } catch {
    throw new Error("Excel 解析失败，请检查文件格式");
  }

  if (!workbook.SheetNames.length) {
    throw new Error("未找到包含订单数据的 Sheet");
  }

  const selected = selectSheet(workbook);
  if (!selected || selected.score < 20) {
    throw new Error("未识别到有效表头，请手动整理表头后重新导入");
  }

  const fingerprint = fingerprintHeaders(selected.headers);
  const remembered = findSavedMapping(selected.headers, fingerprint);
  const mapping = remembered?.mapping ?? selected.mapping;
  const dataRows = selected.matrix.slice(selected.headerRowIndex + 1).filter((row) =>
    row.some((cell) => String(cell ?? "").trim() !== ""),
  );

  const rows: OrderRow[] = [];
  const sourceRows = dataRows.map((row) => row.map((cell) => String(cell ?? "").trim()));
  const total = dataRows.length;
  dataRows.forEach((row, index) => {
    rows.push(rowToOrder(row, mapping));
    if (index % 25 === 0 || index === total - 1) {
      onProgress?.(index + 1, total);
    }
  });

  return {
    sheetName: selected.sheetName,
    headerRowIndex: selected.headerRowIndex,
    headers: selected.headers,
    fingerprint,
    mapping,
    fromMemory: remembered?.fromMemory ?? false,
    confidence: remembered?.confidence ?? selected.score / 50,
    rows,
    sourceRows,
    totalRows: total,
  };
}

export function remapRows(matrixRows: unknown[][], mapping: ColumnMapping) {
  return matrixRows.map((row) => rowToOrder(row, mapping));
}

export function exportOrders(rows: OrderRow[]) {
  const headers = fieldConfigs.map((field) => field.label);
  const body = rows.map((row) => fieldConfigs.map((field) => row[field.key]));
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...body]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "订单数据");
  XLSX.writeFile(workbook, `orders-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
