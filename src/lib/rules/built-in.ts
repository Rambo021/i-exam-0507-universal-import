import { FileStructureSummary, ParseRule } from "./schema";

export const builtInRules: ParseRule[] = [
  {
    id: "builtin-dispatch-delivery-note-xlsx-v1",
    name: "内置模板：配送发货单 Excel",
    description: "适配配送发货单：头部机构信息、商品明细表、尾部收货人信息。",
    fileTypes: ["xlsx", "xls"],
    version: 1,
    parser: {
      mode: "table",
      headerRow: 3,
      dataStartRow: 4,
      dataEndStrategy: "untilFooter",
      footerPattern: "^(合计|单据号|收货人|备注)",
      skipRows: [{ type: "contains", text: "合计" }],
      tailExtractors: {
        externalCode: { source: "textBlock", pattern: "单据号\\s*(?<value>[A-Za-z0-9-]+)", confidence: 0.95, reason: "尾部单据号字段" },
        storeName: { source: "textBlock", pattern: "收货机构\\s*(?<value>.*?)\\s+供货机构", confidence: 0.95, reason: "头部收货机构字段" },
        receiverName: { source: "textBlock", pattern: "收货人\\s*(?<value>[^\\s]+)", confidence: 0.95, reason: "尾部收货人字段" },
        receiverPhone: { source: "textBlock", pattern: "收货电话\\s*(?<value>1[3-9]\\d{9}|0\\d{2,3}-?\\d{7,8})", cellTransform: "phone", confidence: 0.95, reason: "尾部收货电话字段" },
        receiverAddress: { source: "textBlock", pattern: "收货地址\\s*(?<value>[^\\n]+)", confidence: 0.95, reason: "尾部收货地址字段" },
      },
    },
    output: {
      groupBy: [{ source: "extracted", key: "externalCode" }],
      order: {
        externalCode: { source: "extracted", key: "externalCode", confidence: 0.95, reason: "尾部单据号" },
        storeName: { source: "extracted", key: "storeName", confidence: 0.95, reason: "头部收货机构" },
        receiverName: { source: "extracted", key: "receiverName", confidence: 0.95, reason: "尾部收货人" },
        receiverPhone: { source: "extracted", key: "receiverPhone", confidence: 0.95, reason: "尾部收货电话" },
        receiverAddress: { source: "extracted", key: "receiverAddress", confidence: 0.95, reason: "尾部收货地址" },
        remark: { source: "header", header: "备注", confidence: 0.7, reason: "商品表备注列" },
      },
      item: {
        skuCode: { source: "header", header: "物品编码", confidence: 0.95, reason: "商品表表头" },
        skuName: { source: "header", header: "物品名称", confidence: 0.95, reason: "商品表表头" },
        quantity: { source: "header", header: "发货数量", cellTransform: "number", confidence: 0.95, reason: "商品表表头" },
        spec: { source: "header", header: "规格型号", confidence: 0.9, reason: "商品表表头" },
      },
    },
    aiHints: [{ path: "parser", confidence: 0.95, reason: "固定配送发货单版式" }],
  },
  {
    id: "builtin-store-sku-matrix-xlsx-v1",
    name: "内置模板：门店 SKU 矩阵 Excel",
    description: "适配库存/下单矩阵：SKU 为行、门店为列；外部商品编码映射为 SKU物品编码，若为空则回退 SKU条码。",
    fileTypes: ["xlsx", "xls"],
    version: 1,
    parser: {
      mode: "matrix",
      headerRows: [0],
      rowStart: 1,
      rowEndStrategy: "untilEmpty",
      rowKey: { source: "extracted", key: "skuCode", confidence: 0.9, reason: "SKU 行编码" },
      rowExtractors: {
        skuCode: { source: "header", header: "外部商品编码", confidence: 0.95, reason: "SKU 行字段" },
        skuBarcode: { source: "header", header: "SKU条码", confidence: 0.85, reason: "外部商品编码为空时作为 SKU 编码兜底" },
        skuName: { source: "header", header: "SKU名称", confidence: 0.95, reason: "SKU 行字段" },
        spec: { source: "header", header: "规格", confidence: 0.8, reason: "SKU 行字段" },
      },
      colKey: {
        type: "store",
        startCol: 13,
        endCol: 18,
        headerRow: 0,
      },
      skipEmptyCells: true,
    },
    output: {
      groupBy: [{ source: "extracted", key: "storeName" }],
      order: {
        storeName: { source: "extracted", key: "storeName", confidence: 0.95, reason: "门店列表头" },
      },
      item: {
        skuCode: { source: "extracted", key: "skuCode", confidence: 0.95, reason: "SKU 行字段" },
        skuName: { source: "extracted", key: "skuName", confidence: 0.95, reason: "SKU 行字段" },
        quantity: { source: "extracted", key: "matrixValue", cellTransform: "number", confidence: 0.95, reason: "门店交叉单元格" },
        spec: { source: "extracted", key: "spec", confidence: 0.8, reason: "SKU 行字段" },
      },
    },
    aiHints: [{ path: "parser", confidence: 0.9, reason: "门店列从第 14 列开始，到下单后结余前结束" }],
  },
  {
    id: "builtin-dispatch-delivery-note-pdf-v1",
    name: "内置模板：配送单 PDF",
    description: "适配配送单 PDF 文本：头部单据/机构信息、明细行、尾部收货信息。",
    fileTypes: ["pdf"],
    version: 1,
    parser: {
      mode: "textBlocks",
      blockSeparator: "__NO_SPLIT__",
      headerExtractors: {
        externalCode: { source: "textBlock", pattern: "单据编号[:：]\\s*(?<value>[A-Za-z0-9-]+)", confidence: 0.95, reason: "PDF 头部单据编号" },
        storeName: { source: "textBlock", pattern: "收货机构[:：]\\s*(?<value>.*?)\\s+订货机构", confidence: 0.95, reason: "PDF 头部收货机构" },
        receiverName: { source: "textBlock", pattern: "收货人[:：]\\s*(?<value>[^\\s]+)", confidence: 0.95, reason: "PDF 尾部收货人" },
        receiverPhone: { source: "textBlock", pattern: "收货电话[:：]\\s*(?<value>1[3-9]\\d{9}|0\\d{2,3}-?\\d{7,8})", cellTransform: "phone", confidence: 0.95, reason: "PDF 尾部收货电话" },
        receiverAddress: { source: "textBlock", pattern: "收货地址[:：]\\s*(?<value>[^\\n]+)", confidence: 0.95, reason: "PDF 尾部收货地址" },
      },
      itemLinePattern: "^\\s*\\d+\\s+.*?\\s+(?<skuCode>[A-Z0-9-]{4,})\\s+(?<skuName>.*?)\\s+(?<spec>(?:\\d|[A-Z]+码|均码).*?)\\s+(?:件|包|瓶|桶)\\s+(?<quantity>\\d+(?:\\.\\d+)?)\\s*$",
      lineContinuationPattern: "^\\s*(件|包|瓶|桶)\\s+(?:件|包|瓶|桶)?\\s*\\d+(?:\\.\\d+)?\\s*$",
      skipLinePattern: "^(物品类别|第\\d+页|--|合$|计\\s|制单日期|收货人|收货地址|打印次数|备注|收货人签字|单据编号|分拣状态|预计|发货|供货|配送重量)",
    },
    output: {
      groupBy: [{ source: "extracted", key: "externalCode" }],
      order: {
        externalCode: { source: "extracted", key: "externalCode", confidence: 0.95, reason: "PDF 头部单据编号" },
        storeName: { source: "extracted", key: "storeName", confidence: 0.95, reason: "PDF 头部收货机构" },
        receiverName: { source: "extracted", key: "receiverName", confidence: 0.95, reason: "PDF 尾部收货人" },
        receiverPhone: { source: "extracted", key: "receiverPhone", confidence: 0.95, reason: "PDF 尾部收货电话" },
        receiverAddress: { source: "extracted", key: "receiverAddress", confidence: 0.95, reason: "PDF 尾部收货地址" },
      },
      item: {
        skuCode: { source: "header", header: "skuCode", confidence: 0.95, reason: "PDF 明细行正则" },
        skuName: { source: "header", header: "skuName", confidence: 0.95, reason: "PDF 明细行正则" },
        quantity: { source: "header", header: "quantity", cellTransform: "number", confidence: 0.95, reason: "PDF 明细行正则" },
        spec: { source: "header", header: "spec", confidence: 0.9, reason: "PDF 明细行正则" },
      },
    },
    aiHints: [{ path: "parser", confidence: 0.9, reason: "PDF 配送单固定文本结构" }],
  },
];

function flattenSummary(summary: FileStructureSummary) {
  return [
    summary.fileName,
    ...(summary.sheets ?? []).flatMap((sheet) => [
      sheet.name,
      ...sheet.previewRows.map((row) => row.join(" ")),
      ...sheet.tailRows.map((row) => row.join(" ")),
    ]),
    ...(summary.textBlocks ?? []).map((block) => block.text),
  ].join("\n");
}

export function matchBuiltInRule(summary: FileStructureSummary) {
  const text = flattenSummary(summary);
  if ((summary.fileType === "xlsx" || summary.fileType === "xls") && /配送发货单|收货机构|供货机构/.test(text) && /物品编码|物品名称|发货数量/.test(text)) {
    return builtInRules.find((rule) => rule.id === "builtin-dispatch-delivery-note-xlsx-v1");
  }
  if ((summary.fileType === "xlsx" || summary.fileType === "xls") && /仓库名称|SKU名称|外部商品编码|下单后结余/.test(text) && /银泰|金银潭|门店/.test(text)) {
    return builtInRules.find((rule) => rule.id === "builtin-store-sku-matrix-xlsx-v1");
  }
  if (summary.fileType === "pdf" && /配送单|单据编号|收货机构/.test(text) && /物品编码|发货数量|收货地址/.test(text)) {
    return builtInRules.find((rule) => rule.id === "builtin-dispatch-delivery-note-pdf-v1");
  }
  return undefined;
}
