import { ShipmentField, ShipmentRow } from "@/lib/types";

export type FileType = "xlsx" | "xls" | "docx" | "pdf";

export type CellSelector = {
  source: "column" | "header" | "regex" | "static" | "sheetName" | "textBlock" | "extracted";
  index?: number;
  header?: string;
  key?: string;
  pattern?: string;
  value?: string;
  joinWith?: string;
  cellTransform?: "trim" | "date" | "number" | "phone" | "none";
  confidence?: number;
  reason?: string;
};

export type RowFilterRule = {
  type: "empty" | "contains" | "regex";
  column?: number;
  text?: string;
  pattern?: string;
};

export type TableParserRule = {
  mode: "table";
  sheet?: string;
  headerRow: number;
  dataStartRow: number;
  dataEndStrategy?: "untilEmpty" | "untilFooter" | "fixedRows";
  fixedRows?: number;
  footerPattern?: string;
  skipRows?: RowFilterRule[];
  tailExtractors?: Record<string, CellSelector>;
};

export type MultiSheetTableParserRule = Omit<TableParserRule, "mode" | "sheet"> & {
  mode: "multiSheetTable";
  sheetPattern?: string;
  includeSheets?: string[];
  excludeSheets?: string[];
  sheetAsStoreName?: boolean;
};

export type MatrixParserRule = {
  mode: "matrix";
  sheet?: string;
  headerRows: number[];
  rowStart: number;
  rowKey: CellSelector;
  colKey: {
    type: "store" | "date" | "sku";
    startCol: number;
    endCol?: number;
    headerRow: number;
  };
  cellSplit?: {
    lineSeparator?: string;
    itemPattern?: string;
    quantityGroup?: string;
    nameGroup?: string;
  };
  skipEmptyCells?: boolean;
};

export type CardListParserRule = {
  mode: "cardList";
  sheet?: string;
  boundary: {
    type: "regex" | "contains" | "fixedRows" | "blankLineGap";
    pattern?: string;
    text?: string;
    rowsPerCard?: number;
    blankLineCount?: number;
  };
  headerExtractors: Record<string, CellSelector>;
  itemTable: {
    headerPattern?: string;
    headerRowOffset?: number;
    dataStartOffset: number;
    dataEndPattern?: string;
    skipRows?: RowFilterRule[];
  };
};

export type TextBlocksParserRule = {
  mode: "textBlocks";
  blockSeparator: string;
  headerExtractors: Record<string, CellSelector>;
  itemLinePattern: string;
};

export type PdfTablesParserRule = {
  mode: "pdfTables";
  pageRange?: [number, number];
  orderSeparator?: string;
  tableHeaderPattern: string;
  footerExtractors?: Record<string, CellSelector>;
  skipRows?: RowFilterRule[];
};

export type ParserRule =
  | TableParserRule
  | MultiSheetTableParserRule
  | MatrixParserRule
  | CardListParserRule
  | TextBlocksParserRule
  | PdfTablesParserRule;

export type OutputMappingRule = {
  groupBy?: CellSelector[];
  order: Partial<Record<Extract<ShipmentField, "externalCode" | "storeName" | "receiverName" | "receiverPhone" | "receiverAddress" | "remark">, CellSelector>>;
  item: Record<Extract<ShipmentField, "skuCode" | "skuName" | "quantity">, CellSelector> &
    Partial<Record<Extract<ShipmentField, "spec">, CellSelector>>;
  defaults?: Partial<Record<ShipmentField, string>>;
};

export type AiRuleHint = {
  path: string;
  confidence: number;
  reason: string;
};

export type ParseRule = {
  id: string;
  name: string;
  description: string;
  fileTypes: FileType[];
  version: number;
  parser: ParserRule;
  output: OutputMappingRule;
  aiHints?: AiRuleHint[];
};

export type SheetSummary = {
  name: string;
  rowCount: number;
  colCount: number;
  merges: Array<{ startRow: number; startCol: number; endRow: number; endCol: number }>;
  previewRows: string[][];
  tailRows: string[][];
};

export type TextBlockSummary = {
  page?: number;
  index: number;
  text: string;
};

export type FileStructureSummary = {
  fileName: string;
  fileType: FileType;
  sheets?: SheetSummary[];
  textBlocks?: TextBlockSummary[];
  detectedPatterns: Array<{
    type: "headerCandidate" | "separator" | "matrixCandidate" | "cardBoundary" | "footerInfo";
    location: string;
    value: string;
    confidence: number;
  }>;
};

export type SheetData = {
  name: string;
  rows: string[][];
  merges: SheetSummary["merges"];
};

export type ParsedFile = {
  fileName: string;
  fileType: FileType;
  sheets: SheetData[];
  textBlocks: TextBlockSummary[];
  summary: FileStructureSummary;
};

export type RuleTestResult = {
  rows: ShipmentRow[];
  summary: FileStructureSummary;
};

export function isFileType(value: string): value is FileType {
  return value === "xlsx" || value === "xls" || value === "docx" || value === "pdf";
}

export function getFileType(fileName: string): FileType | null {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return isFileType(ext) ? ext : null;
}

export function validateRule(rule: unknown): ParseRule {
  if (!rule || typeof rule !== "object") {
    throw new Error("规则不能为空");
  }
  const candidate = rule as ParseRule;
  if (!candidate.name || !candidate.parser || !candidate.output) {
    throw new Error("规则缺少 name、parser 或 output");
  }
  if (!candidate.fileTypes?.length || candidate.fileTypes.some((item) => !isFileType(item))) {
    throw new Error("规则文件类型无效");
  }
  if (!candidate.output.item?.skuCode || !candidate.output.item?.skuName || !candidate.output.item?.quantity) {
    throw new Error("规则必须映射 SKU 编码、名称和数量");
  }
  return {
    ...candidate,
    id: candidate.id || crypto.randomUUID(),
    version: candidate.version || 1,
    description: candidate.description || "",
    aiHints: candidate.aiHints ?? [],
  };
}
