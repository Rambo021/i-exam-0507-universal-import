import { nanoid } from "nanoid";
import { ShipmentField, ShipmentRow } from "@/lib/types";
import {
  CardListParserRule,
  CellSelector,
  MatrixParserRule,
  ParsedFile,
  ParseRule,
  RowFilterRule,
  SheetData,
  TableParserRule,
  TextBlocksParserRule,
  validateRule,
} from "./schema";

type Context = {
  row?: string[];
  headers?: string[];
  sheetName?: string;
  textBlock?: string;
  extracted?: Record<string, string>;
};

type RowContext = Context & {
  itemRow?: string[];
  source?: ShipmentRow["source"];
};

function blankShipmentRow(): ShipmentRow {
  return {
    id: nanoid(8),
    externalCode: "",
    storeName: "",
    receiverName: "",
    receiverPhone: "",
    receiverAddress: "",
    skuCode: "",
    skuName: "",
    quantity: "",
    spec: "",
    remark: "",
  };
}

function normalize(value: string, transform?: CellSelector["cellTransform"]) {
  const text = String(value ?? "").trim();
  if (!transform || transform === "trim" || transform === "none") return text;
  if (transform === "phone") return text.replace(/[^\d-]/g, "");
  if (transform === "number") {
    const match = text.match(/-?\d+(?:\.\d+)?/);
    return match?.[0] ?? "";
  }
  if (transform === "date") return text.replace(/\s+/g, "");
  return text;
}

function firstRegexValue(text: string, pattern: string) {
  const match = text.match(new RegExp(pattern, "im"));
  if (!match) return "";
  const groups = match.groups as Record<string, string> | undefined;
  return groups?.value ?? match[1] ?? match[0] ?? "";
}

function repairMojibake(value: string) {
  const text = String(value ?? "");
  if (!/[ÃÂÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖÙÚÛÜÝÞßà-ÿ]/.test(text)) return text;
  try {
    const repaired = Buffer.from(text, "latin1").toString("utf8");
    return repaired.includes("\uFFFD") ? text : repaired;
  } catch {
    return text;
  }
}

function normalizeHeaderText(value: string) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[()（）【】[\]{}]/g, "");
}

function findHeaderIndex(headers: string[] | undefined, expected?: string) {
  if (!headers?.length || !expected) return -1;
  const expectedVariants = Array.from(new Set([expected, repairMojibake(expected)])).map(normalizeHeaderText).filter(Boolean);
  const normalizedHeaders = headers.map((header) => normalizeHeaderText(header));
  const exactIndex = normalizedHeaders.findIndex((header) => expectedVariants.includes(header));
  if (exactIndex >= 0) return exactIndex;
  return normalizedHeaders.findIndex((header) =>
    expectedVariants.some((candidate) => header.includes(candidate) || candidate.includes(header)),
  );
}

function resolveSelector(selector: CellSelector | undefined, context: Context) {
  if (!selector) return "";
  let value = "";
  if (selector.source === "static") {
    value = selector.value ?? "";
  } else if (selector.source === "sheetName") {
    value = context.sheetName ?? "";
  } else if (selector.source === "column") {
    value = context.row?.[selector.index ?? -1] ?? "";
  } else if (selector.source === "header") {
    const index = findHeaderIndex(context.headers, selector.header);
    value = context.row?.[index] ?? "";
  } else if (selector.source === "regex") {
    value = firstRegexValue([...(context.row ?? []), context.textBlock ?? ""].join(" "), selector.pattern ?? "");
  } else if (selector.source === "textBlock") {
    value = firstRegexValue(context.textBlock ?? "", selector.pattern ?? "");
  } else if (selector.source === "extracted") {
    value = context.extracted?.[selector.key ?? ""] ?? "";
  }
  return normalize(value, selector.cellTransform);
}

function resolveGroupKey(selectors: CellSelector[] | undefined, context: Context) {
  for (const selector of selectors ?? []) {
    const value = resolveSelector(selector, context);
    if (value) return value;
  }
  return "";
}

function shouldSkipRow(row: string[], filters: RowFilterRule[] = []) {
  const cells = row.map((cell) => String(cell ?? ""));
  if (!cells.some((cell) => cell.trim())) return true;
  const joined = cells.join(" ");
  return filters.some((filter) => {
    if (filter.type === "empty") return !cells.some((cell) => cell.trim());
    const target = filter.column === undefined ? joined : cells[filter.column] ?? "";
    if (filter.type === "contains") return target.includes(filter.text ?? "");
    return new RegExp(filter.pattern ?? "", "i").test(target);
  });
}

function rowToShipment(rule: ParseRule, context: RowContext): ShipmentRow {
  const row = blankShipmentRow();
  for (const [field, selector] of Object.entries(rule.output.order) as Array<[ShipmentField, CellSelector]>) {
    row[field] = resolveSelector(selector, context);
  }
  for (const [field, selector] of Object.entries(rule.output.item) as Array<[ShipmentField, CellSelector]>) {
    row[field] = resolveSelector(selector, context);
  }
  for (const [field, value] of Object.entries(rule.output.defaults ?? {}) as Array<[ShipmentField, string]>) {
    if (!row[field]) row[field] = value;
  }
  const groupKey = resolveGroupKey(rule.output.groupBy, context);
  row.orderKey = groupKey || row.externalCode || `${context.sheetName ?? "file"}:${context.source?.rowIndex ?? context.source?.blockIndex ?? row.id}`;
  row.source = context.source;
  return row;
}

function selectSheet(file: ParsedFile, sheetName?: string) {
  if (!file.sheets.length) throw new Error("当前规则需要 Excel Sheet，但文件中没有 Sheet 数据");
  if (!sheetName) return file.sheets[0];
  return file.sheets.find((sheet) => sheet.name === sheetName) ?? file.sheets[0];
}

function parseTableSheet(rule: ParseRule, parser: TableParserRule, sheet: SheetData, overrideExtracted?: Record<string, string>) {
  const headers = sheet.rows[parser.headerRow] ?? [];
  const rows: ShipmentRow[] = [];
  const tailText = sheet.rows.map((row) => row.join(" ")).join("\n");
  const tailExtracted = Object.fromEntries(
    Object.entries(parser.tailExtractors ?? {}).map(([key, selector]) => [key, resolveSelector(selector, { textBlock: tailText, sheetName: sheet.name })]),
  );
  const extracted = { ...tailExtracted, ...overrideExtracted };
  const fixedEnd = parser.fixedRows ? parser.dataStartRow + parser.fixedRows : sheet.rows.length;

  for (let index = parser.dataStartRow; index < Math.min(sheet.rows.length, fixedEnd); index += 1) {
    const row = sheet.rows[index];
    const joined = row.join(" ");
    if (parser.dataEndStrategy === "untilEmpty" && !row.some(Boolean)) break;
    if (parser.dataEndStrategy === "untilFooter" && parser.footerPattern && new RegExp(parser.footerPattern).test(joined)) break;
    if (shouldSkipRow(row, parser.skipRows)) continue;
    rows.push(rowToShipment(rule, { row, headers, sheetName: sheet.name, extracted, source: { sheetName: sheet.name, rowIndex: index + 1 } }));
  }

  return rows;
}

function parseTable(file: ParsedFile, rule: ParseRule, parser: TableParserRule) {
  return parseTableSheet(rule, parser, selectSheet(file, parser.sheet));
}

function parseMultiSheet(file: ParsedFile, rule: ParseRule) {
  const parser = rule.parser;
  if (parser.mode !== "multiSheetTable") return [];
  const pattern = parser.sheetPattern ? new RegExp(parser.sheetPattern) : null;
  return file.sheets.flatMap((sheet) => {
    if (parser.includeSheets?.length && !parser.includeSheets.includes(sheet.name)) return [];
    if (parser.excludeSheets?.includes(sheet.name)) return [];
    if (pattern && !pattern.test(sheet.name)) return [];
    const extracted = parser.sheetAsStoreName ? { storeName: sheet.name } : undefined;
    return parseTableSheet(rule, { ...parser, mode: "table" }, sheet, extracted);
  });
}

function parseMatrix(file: ParsedFile, rule: ParseRule, parser: MatrixParserRule) {
  const sheet = selectSheet(file, parser.sheet);
  const rows: ShipmentRow[] = [];
  const endCol = parser.colKey.endCol ?? Math.max(0, ...sheet.rows.map((row) => row.length));
  const headers = sheet.rows[parser.headerRows.at(-1) ?? 0] ?? [];

  for (let rowIndex = parser.rowStart; rowIndex < sheet.rows.length; rowIndex += 1) {
    const row = sheet.rows[rowIndex];
    const joined = row.join(" ");
    if (parser.rowEndStrategy === "untilEmpty" && !row.some(Boolean)) break;
    if (parser.rowEndStrategy === "untilFooter" && parser.footerPattern && new RegExp(parser.footerPattern).test(joined)) break;
    if (shouldSkipRow(row, parser.skipRows)) continue;
    const rowExtracted = Object.fromEntries(
      Object.entries(parser.rowExtractors ?? {}).map(([key, selector]) => [key, resolveSelector(selector, { row, headers, sheetName: sheet.name })]),
    );
    if (!rowExtracted.skuCode && rowExtracted.skuBarcode) {
      rowExtracted.skuCode = rowExtracted.skuBarcode;
    }
    const rowKey = resolveSelector(parser.rowKey, { row, headers, sheetName: sheet.name, extracted: rowExtracted });
    for (let colIndex = parser.colKey.startCol; colIndex < endCol; colIndex += 1) {
      const cell = row[colIndex]?.trim() ?? "";
      if (parser.skipEmptyCells !== false && !cell) continue;
      const colValue = sheet.rows[parser.colKey.headerRow]?.[colIndex] ?? "";
      const parts = splitMatrixCell(cell, parser);
      parts.forEach((part, partIndex) => {
        const extracted: Record<string, string> = {
          ...rowExtracted,
          rowKey,
          colKey: colValue,
          storeName: parser.colKey.type === "store" ? colValue : rowKey,
          date: parser.colKey.type === "date" ? colValue : "",
          matrixValue: cell,
          matrixItemName: part.name,
          matrixQuantity: part.quantity,
        };
        rows.push(
          rowToShipment(rule, {
            row,
            headers,
            sheetName: sheet.name,
            textBlock: cell,
            extracted,
            source: { sheetName: sheet.name, rowIndex: rowIndex + 1, blockIndex: partIndex + 1 },
          }),
        );
      });
    }
  }
  return rows;
}

function splitMatrixCell(cell: string, parser: MatrixParserRule) {
  const separator = parser.cellSplit?.lineSeparator ? new RegExp(parser.cellSplit.lineSeparator) : /\r?\n|；|;/;
  const pieces = cell.split(separator).map((item) => item.trim()).filter(Boolean);
  if (!pieces.length) return [{ name: cell, quantity: "" }];
  return pieces.map((piece) => {
    if (parser.cellSplit?.itemPattern) {
      const match = piece.match(new RegExp(parser.cellSplit.itemPattern));
      const groups = match?.groups as Record<string, string> | undefined;
      return {
        name: groups?.[parser.cellSplit.nameGroup ?? "name"] ?? match?.[1] ?? piece,
        quantity: groups?.[parser.cellSplit.quantityGroup ?? "quantity"] ?? match?.[2] ?? "",
      };
    }
    const match = piece.match(/(.+?)[xX*×]\s*(\d+(?:\.\d+)?)/);
    return { name: match?.[1]?.trim() ?? piece, quantity: match?.[2] ?? "" };
  });
}

function parseCardList(file: ParsedFile, rule: ParseRule, parser: CardListParserRule) {
  const sheet = selectSheet(file, parser.sheet);
  const cards = splitCards(sheet.rows, parser);
  return cards.flatMap((card, cardIndex) => {
    const textBlock = card.map((row) => row.join(" ")).join("\n");
    const extracted = Object.fromEntries(
      Object.entries(parser.headerExtractors).map(([key, selector]) => [key, resolveSelector(selector, { textBlock, sheetName: sheet.name })]),
    );
    const headerIndex = Math.max(
      0,
      parser.itemTable.headerPattern
        ? card.findIndex((row) => new RegExp(parser.itemTable.headerPattern ?? "", "i").test(row.join(" ")))
        : (parser.itemTable.headerRowOffset ?? 0),
    );
    const headers = card[headerIndex] ?? [];
    const dataStart = headerIndex + parser.itemTable.dataStartOffset;
    const rows: ShipmentRow[] = [];
    for (let index = dataStart; index < card.length; index += 1) {
      const row = card[index];
      const joined = row.join(" ");
      if (parser.itemTable.dataEndPattern && new RegExp(parser.itemTable.dataEndPattern).test(joined)) break;
      if (shouldSkipRow(row, parser.itemTable.skipRows)) continue;
      rows.push(
        rowToShipment(rule, {
          row,
          headers,
          sheetName: sheet.name,
          textBlock,
          extracted,
          source: { sheetName: sheet.name, blockIndex: cardIndex + 1, rowIndex: index + 1 },
        }),
      );
    }
    return rows;
  });
}

function splitCards(rows: string[][], parser: CardListParserRule) {
  if (parser.boundary.type === "fixedRows") {
    const size = Math.max(1, parser.boundary.rowsPerCard ?? rows.length);
    const cards: string[][][] = [];
    for (let index = 0; index < rows.length; index += size) cards.push(rows.slice(index, index + size));
    return cards;
  }
  const starts: number[] = [];
  rows.forEach((row, index) => {
    const text = row.join(" ");
    if (parser.boundary.type === "contains" && text.includes(parser.boundary.text ?? "")) starts.push(index);
    if (parser.boundary.type === "regex" && new RegExp(parser.boundary.pattern ?? "", "i").test(text)) starts.push(index);
  });
  if (!starts.length) return [rows];
  return starts.map((start, index) => rows.slice(start, starts[index + 1] ?? rows.length));
}

function parseTextBlocks(file: ParsedFile, rule: ParseRule, parser: TextBlocksParserRule) {
  const text = file.textBlocks.map((block) => block.text).join("\n\n");
  const blocks = text.split(new RegExp(parser.blockSeparator, "i")).map((block) => block.trim()).filter(Boolean);
  return blocks.flatMap((block, blockIndex) => {
    const extracted = Object.fromEntries(
      Object.entries(parser.headerExtractors).map(([key, selector]) => [key, resolveSelector(selector, { textBlock: block })]),
    );
    const rows: ShipmentRow[] = [];
    const sourceLines = block.split(/\r?\n/).reduce<string[]>((acc, line) => {
      if (parser.skipLinePattern && new RegExp(parser.skipLinePattern, "i").test(line)) return acc;
      if (parser.lineContinuationPattern && new RegExp(parser.lineContinuationPattern, "i").test(line) && acc.length) {
        acc[acc.length - 1] = `${acc[acc.length - 1]} ${line.trim()}`;
        return acc;
      }
      acc.push(line);
      return acc;
    }, []);
    const source = sourceLines.join("\n");
    const regex = new RegExp(parser.itemLinePattern, "gim");
    let match: RegExpExecArray | null;
    while ((match = regex.exec(source))) {
      const groups = (match.groups ?? {}) as Record<string, string>;
      const row = [groups.skuCode ?? groups.code ?? "", groups.skuName ?? groups.name ?? "", groups.spec ?? "", groups.quantity ?? groups.qty ?? ""];
      const headers = ["skuCode", "skuName", "spec", "quantity"];
      rows.push(rowToShipment(rule, { row, headers, textBlock: block, extracted, source: { blockIndex: blockIndex + 1 } }));
    }
    return rows;
  });
}

export function executeRule(file: ParsedFile, inputRule: unknown) {
  const rule = validateRule(inputRule);
  if (!rule.fileTypes.includes(file.fileType)) {
    throw new Error(`规则不支持 ${file.fileType} 文件`);
  }
  if (rule.parser.mode === "table") return parseTable(file, rule, rule.parser);
  if (rule.parser.mode === "multiSheetTable") return parseMultiSheet(file, rule);
  if (rule.parser.mode === "matrix") return parseMatrix(file, rule, rule.parser);
  if (rule.parser.mode === "cardList") return parseCardList(file, rule, rule.parser);
  if (rule.parser.mode === "textBlocks") return parseTextBlocks(file, rule, rule.parser);
  if (rule.parser.mode === "pdfTables") {
    return parseTextBlocks(file, rule, {
      mode: "textBlocks",
      blockSeparator: rule.parser.orderSeparator ?? "\\n\\s*\\n",
      headerExtractors: rule.parser.footerExtractors ?? {},
      itemLinePattern: `${rule.parser.tableHeaderPattern}.*`,
    });
  }
  return [];
}
