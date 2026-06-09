import * as XLSX from "xlsx";
import mammoth from "mammoth";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { FileStructureSummary, ParsedFile, SheetData, TextBlockSummary, getFileType } from "./rules/schema";

const require = createRequire(import.meta.url);

function normalizeCell(value: unknown) {
  return String(value ?? "").trim();
}

function detectPatterns(sheets: SheetData[], textBlocks: TextBlockSummary[]): FileStructureSummary["detectedPatterns"] {
  const patterns: FileStructureSummary["detectedPatterns"] = [];

  sheets.forEach((sheet) => {
    sheet.rows.slice(0, 12).forEach((row, index) => {
      const filled = row.filter(Boolean).length;
      if (filled >= 3) {
        patterns.push({
          type: "headerCandidate",
          location: `${sheet.name}!R${index + 1}`,
          value: row.join(" | ").slice(0, 240),
          confidence: Math.min(0.95, filled / Math.max(row.length || 1, 1) + 0.25),
        });
      }
      if (row.some((cell) => /调拨记录|配送单|签收单|[-━]{4,}/.test(cell))) {
        patterns.push({
          type: "cardBoundary",
          location: `${sheet.name}!R${index + 1}`,
          value: row.join(" | ").slice(0, 240),
          confidence: 0.8,
        });
      }
    });
  });

  textBlocks.forEach((block) => {
    if (/[-━]{4,}|调拨记录|配送签收单|配送单/.test(block.text)) {
      patterns.push({
        type: "separator",
        location: block.page ? `P${block.page}#${block.index}` : `B${block.index}`,
        value: block.text.slice(0, 240),
        confidence: 0.75,
      });
    }
    if (/收货人|收件人|电话|地址/.test(block.text)) {
      patterns.push({
        type: "footerInfo",
        location: block.page ? `P${block.page}#${block.index}` : `B${block.index}`,
        value: block.text.slice(0, 240),
        confidence: 0.65,
      });
    }
  });

  return patterns.slice(0, 30);
}

function buildSummary(fileName: string, fileType: ParsedFile["fileType"], sheets: SheetData[], textBlocks: TextBlockSummary[]) {
  return {
    fileName,
    fileType,
    sheets: sheets.length
      ? sheets.map((sheet) => ({
          name: sheet.name,
          rowCount: sheet.rows.length,
          colCount: Math.max(0, ...sheet.rows.map((row) => row.length)),
          merges: sheet.merges,
          previewRows: sheet.rows.slice(0, 12),
          tailRows: sheet.rows.slice(-8),
        }))
      : undefined,
    textBlocks: textBlocks.length ? textBlocks.slice(0, 80) : undefined,
    detectedPatterns: detectPatterns(sheets, textBlocks),
  } satisfies FileStructureSummary;
}

function readExcel(fileName: string, data: ArrayBuffer): ParsedFile {
  const workbook = XLSX.read(data, { type: "array", cellDates: false });
  const sheets = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, blankrows: false }).map((row) =>
      row.map(normalizeCell),
    );
    const merges = (sheet["!merges"] ?? []).map((merge) => ({
      startRow: merge.s.r,
      startCol: merge.s.c,
      endRow: merge.e.r,
      endCol: merge.e.c,
    }));
    return { name, rows, merges };
  });
  const fileType = getFileType(fileName);
  if (fileType !== "xlsx" && fileType !== "xls") {
    throw new Error("Excel 文件类型无效");
  }
  return {
    fileName,
    fileType,
    sheets,
    textBlocks: [],
    summary: buildSummary(fileName, fileType, sheets, []),
  };
}

async function readDocx(fileName: string, data: ArrayBuffer): Promise<ParsedFile> {
  const result = await mammoth.extractRawText({ buffer: Buffer.from(data) });
  const blocks = result.value
    .split(/\n{2,}/)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text, index) => ({ index, text }));
  return {
    fileName,
    fileType: "docx",
    sheets: [],
    textBlocks: blocks,
    summary: buildSummary(fileName, "docx", [], blocks),
  };
}

async function readPdf(fileName: string, data: ArrayBuffer): Promise<ParsedFile> {
  if (typeof globalThis.DOMMatrix === "undefined") {
    const { DOMMatrix } = require("@napi-rs/canvas") as { DOMMatrix: typeof globalThis.DOMMatrix };
    globalThis.DOMMatrix = DOMMatrix;
  }
  const { PDFParse } = await import("pdf-parse");
  PDFParse.setWorker(pathToFileURL(path.join(process.cwd(), "node_modules", "pdf-parse", "dist", "worker", "pdf.worker.mjs")).toString());
  const parser = new PDFParse({ data: Buffer.from(data) });
  const result = await parser.getText();
  await parser.destroy();
  const blocks = result.text.split(/\n{2,}/).map((text) => text.trim()).filter(Boolean).map((text, index) => ({ index, text }));
  return {
    fileName,
    fileType: "pdf",
    sheets: [],
    textBlocks: blocks,
    summary: buildSummary(fileName, "pdf", [], blocks),
  };
}

export async function readUploadedFile(file: File): Promise<ParsedFile> {
  const fileType = getFileType(file.name);
  if (!fileType) {
    throw new Error("仅支持 .xlsx / .xls / .docx / .pdf 文件");
  }
  const data = await file.arrayBuffer();
  if (!data.byteLength) {
    throw new Error("文件为空或没有可读取数据");
  }
  if (fileType === "xlsx" || fileType === "xls") return readExcel(file.name, data);
  if (fileType === "docx") return readDocx(file.name, data);
  return readPdf(file.name, data);
}

export function readParsedFileFromPayload(input: {
  fileName: string;
  fileType: ParsedFile["fileType"];
  sheets?: SheetData[];
  textBlocks?: TextBlockSummary[];
}): ParsedFile {
  const sheets = input.sheets ?? [];
  const textBlocks = input.textBlocks ?? [];
  return {
    fileName: input.fileName,
    fileType: input.fileType,
    sheets,
    textBlocks,
    summary: buildSummary(input.fileName, input.fileType, sheets, textBlocks),
  };
}
