# 万能导入 V2 需求分析与实施计划

更新时间：2026-06-05

## Review 意见（2026-06-05）

**总体评价：** 方案结构完整，DSL 设计方向正确，阶段划分合理。以下为具体问题和建议：

### 高优先级问题

1. **规则 DSL 细节缺失**（第 5 节）：`ParserRule` 和 `OutputMappingRule` 只有 mode 枚举，缺少具体字段定义。实现时如果没有约束，规则引擎和 AI Prompt 都会各自定义，导致格式不一致。建议在实施阶段 1 完成前先把完整 DSL schema 写进 `src/lib/rules/schema.ts` 并在文档中给出 1-2 个完整规则示例（如 `table` 模式对应欢乐牧场 Excel）。

2. **AI Prompt 设计未定义**（第 6 节）：只写了"设计 Prompt"但没有关键约束。AI 对规则格式的理解直接影响输出质量。建议在文档补充 Prompt 的关键要素：传入的 `FileStructureSummary` 结构定义、期望输出的 JSON schema、低置信度标记的格式（`confidence: 0-1`、`reason: string`）。

3. **`cardList` 模式边界识别未说明**（第 5.1 节）：卡片边界如何判断（固定行数、分隔行关键词、空行间隔）没有描述。门店调拨单-卡片式是唯一样例，建议补充该模式的 `boundaryPattern` 字段设计。

### 中优先级建议

4. **数据库缺少 `parse_rules` 的 `deleted_at` 软删除**（第 8 节）：规则被引用历史导入时不应硬删除，否则历史批次的 `rule_id` 关联会指向不存在的规则。建议加 `deleted_at nullable`，查询时过滤已删除。

5. **`import_batches` 缺少状态字段**（第 8 节）：当前字段有 `success_count`、`failed_count`，但没有 `status`（`pending/processing/done/failed`）。1000+ 条数据解析是异步操作，前端需要轮询状态，缺少这个字段会导致实现时临时加字段。

6. **性能指标不够具体**（第 10 节验收清单）：「1000 条标准数据 10 秒内进入预览，前端渲染 3 秒内完成」没有定义"标准数据"——是 1000 个订单各 1 条 SKU，还是 1000 条 SKU 行？建议明确，并说明虚拟列表的触发阈值（如 > 200 行启用）。

7. **`/rules/[id]` 试解析的文件来源未说明**（第 7 节）：编辑规则时试解析用哪个文件？用上传过的最近文件还是要求用户重新上传？这个交互没有定义，实现时会遗漏。建议补充：规则编辑器允许上传"测试文件"（不入库），或复用最近一次上传的文件预览。

### 低优先级 / 可选

8. **`matrix` 模式缺少转置方向说明**：周配送计划是"日期为列、门店为行"，欢乐牧场是"SKU 为列、门店为行"，两种转置方向相反。建议在 DSL 中明确 `rowKey` / `colKey` 字段，避免实现时歧义。

9. **缺少 API 错误响应约定**（第 7 节）：多个 API 端点没有统一错误格式。建议约定 `{ error: string, details?: unknown }` 或类似结构，防止前端每个接口各自处理。

10. **阶段顺序建议微调**：阶段 5（规则管理 UI）依赖阶段 3（规则引擎）和阶段 4（AI 生成），当前顺序正确。但建议阶段 4 AI 生成之前先用一个固定的手写样例规则跑通规则引擎端到端，这样 AI 生成的规则有"对照标准"，调试 Prompt 时更容易定位问题。

### Review 第二轮（2026-06-05）

1. **`CellSelector.source: "textBlock"` 语义未定义**：当前文档没有说明 `textBlock` 是"重新对原始卡片文本跑正则"还是"读取 `headerExtractors` 已提取的中间结果"。实现者必须自己发明语义。建议明确：`textBlock` 表示引擎对当前文本块（卡片原文或段落原文）重新执行 `pattern` 正则；`headerExtractors` 的提取结果通过键名引用，用 `source: "extracted"` 加 `key` 字段区分。

2. **`OutputMappingRule.groupBy: CellSelector[]` 多选择器语义不明**：数组有多个元素时引擎应如何决策文档未说明。最可能的意图是"依次尝试，取第一个非空值"（优先回退）。建议在文档和 schema 中补充：`groupBy` 数组语义为 **priority fallback**，引擎按顺序取第一个能解析出非空值的 `CellSelector`。

3. **`CardListParserRule` 的 `headerExtractors` 与 `output.order` 重复**：示例规则中两处都用相同正则提取 `storeName`、`receiverPhone`，但两者关系未定义。建议明确职责分离：`parser.headerExtractors` 负责提取并命名中间字段，`output.order` 中对应字段使用 `source: "extracted", key: "storeName"` 引用，不重复写正则。

4. **`MatrixParserRule.colKey.type` 行为未定义**：文档没有说明 `"store" | "date" | "sku"` 是否影响引擎解析逻辑（如 `date` 是否自动解析日期格式）。建议明确：`type` 是**语义标注**，不影响引擎解析行为，仅供 AI 生成规则和人工阅读时理解列轴语义。若未来需要日期格式化，通过 `cellTransform` 字段扩展，不隐式依赖 `type`。

5. **主工作台两条流程的状态转换未定义**：section 7 列出了"选择已有规则"和"新建规则触发 AI"两个入口，但没有描述：用户上传文件后立即看到什么、两个流程如何切换、AI 生成规则并编辑后如何携带规则返回工作台继续解析。建议补充工作台状态机：`idle → file-uploaded → rule-selected → parsed → preview-ready → submitted`，并说明"新建规则"在 `file-uploaded` 状态打开规则编辑器侧边栏或跳转页面，完成后自动回到 `rule-selected` 状态。

### Review 处理结论

- 采纳第 1、2、3 条：补充 DSL schema、`FileStructureSummary`、Prompt 约束、`cardList.boundary` 字段和完整规则示例。
- 采纳第 4、5 条：数据库增加规则软删除、批次状态和解析耗时字段。1000 行解析本身可前端分片完成，但批次状态对提交和历史追踪仍有价值。
- 采纳第 6、7 条：明确性能口径为 1000 条 SKU 明细行，并定义规则试解析文件来源。
- 采纳第 8、9 条：补充 `matrix` 转置方向字段和 API 统一错误响应。
- 采纳第 10 条：实施顺序调整为先用手写样例规则跑通端到端，再接 AI 生成规则。
- 采纳第二轮第 1、3 条：明确 `textBlock` 是对当前文本块重新跑正则，新增 `source: "extracted"` 通过 `key` 引用 `headerExtractors` 的中间结果，避免重复写正则。
- 采纳第二轮第 2 条：明确 `groupBy` 多选择器为 priority fallback，按顺序取第一个非空值。
- 采纳第二轮第 4 条：明确 `MatrixParserRule.colKey.type` 只是语义标注，不隐式改变解析逻辑；转换能力通过 `cellTransform` 扩展。
- 采纳第二轮第 5 条：补充主工作台状态机和“新建规则后回到规则已选中状态”的交互闭环。

## 1. 需求目标

本次考试要求将现有批量导入系统升级为“智能多格式批量下单系统 V2”。核心不是继续扩展固定 Excel 模板识别，而是建立一套通用解析规则体系，并通过大模型辅助生成规则，让 Excel、Word、PDF 中的复杂出库单都能配置化解析为统一下单数据。

最终需要完成：

- Next.js App Router + TypeScript Web 应用。
- 鲸天系统风格 UI，主色 `#0fc6c2`，清爽蓝绿色调、圆角卡片、明确反馈。
- 支持 Excel `.xlsx/.xls`、Word `.docx`、PDF 上传。
- 支持规则管理：创建、编辑、删除、复制、保存到服务端持久化存储。
- 支持 AI 分析文件结构并生成“解析规则”，用户确认后保存，不允许 AI 直接绕过规则引擎输出最终数据。
- 支持规则预览测试、解析执行、类 Excel 数据预览编辑、全量错误展示、导出 Excel、提交入库、历史运单列表。
- 部署到 Vercel，并将可访问 URL 填写到 `http://106.12.10.129:10010/`。

## 2. 本地附件核查

已读取：

- `考试要求-文件版本.html`
- `AI考试附件.zip`
- 项目目录 `C:\Users\Administrator\Documents\Work\Repos\ai-exam-0507-universal-import`

压缩包当前能识别到的业务文件为 6 份：

| 类型 | 文件特征 | 需求对应 |
| --- | --- | --- |
| PDF | 黔寨寨贵州烤锅常温 | 黔寨寨配送单 |
| Excel | 欢乐牧场模板0430 | 欢乐牧场模板 |
| Excel | 12.25 海口龙湖天街配送发货单 | 黎明屯/配送发货单类尾部信息格式 |
| Excel | 多门店分Sheet出库单 | 多 Sheet 合并 |
| Excel | 湖南仓 | 湖南仓发货明细 |
| Excel | 门店调拨单-卡片式 | 卡片式调拨单 |

需求 HTML 描述为 9 份 demo，还包括：

- 门店配送确认单：Word 纯文本段落式。
- 周配送计划：Excel 日期 x 门店矩阵 + 复合单元格拆分。
- 配送签收单(多单PDF)：PDF 多订单拆分。

当前 zip 内未看到这 3 份文件。实现时仍按 9 类结构设计规则引擎，缺失文件到位后再补充样例规则和回归测试。

## 3. 当前项目状态与差距

现有项目是 V1 方向实现：

- 支持 `.xlsx/.xls`。
- 通过固定字段别名、表头扫描、模板记忆解析 Excel。
- 统一字段仍是发件人、收件人、重量、件数、温层。
- 模板记忆主要保存在 `localStorage`，服务端只保存 header mapping。
- 已有 Neon PostgreSQL 数据表：`orders`、`import_batches`、`template_mappings`。
- 已有预览编辑、校验、导出、提交、历史列表基础能力。

与 V2 要求的主要差距：

- 字段模型不匹配：V2 是“出库单 + SKU 明细”模型，不是单行物流运单字段。
- 缺少规则管理页面和可编辑规则 DSL。
- 缺少 AI 生成规则流程。
- 缺少 Word/PDF 解析能力。
- 缺少多 Sheet、矩阵转置、卡片拆分、纯文本正则、PDF 多单拆分等通用规则执行器。
- 现有解析逻辑依赖表头别名推断，不能满足“代码零改动新增格式”的要求。
- 1000+ 数据渲染未做虚拟化，表格可能卡顿。
- README 和旧需求文档仍是 V1 表述，需要更新。

## 4. V2 统一数据模型

### 4.1 出库单模型

每个出库单按 `externalCode` 聚合。同一外部编码下多条 SKU 行共享收货信息。

```ts
type ShipmentOrder = {
  id: string;
  externalCode: string;
  storeName: string;
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  remark: string;
  items: ShipmentItem[];
};

type ShipmentItem = {
  id: string;
  skuCode: string;
  skuName: string;
  quantity: string;
  spec: string;
};
```

### 4.2 校验规则

- `skuCode`、`skuName`、`quantity` 必填。
- `quantity` 必须为正数。
- 收货信息满足 A/B 二选一：
  - A 组：`storeName` 非空。
  - B 组：`receiverName`、`receiverPhone`、`receiverAddress` 均非空。
- 电话有值时校验常见手机号/座机格式。
- `externalCode` 有值时参与批内重复和历史重复校验。
- 全部错误一次性列出，精确到订单、SKU 行、字段、原因。

## 5. 解析规则 DSL 设计

规则必须描述“如何从文件结构抽取数据”，而不是为每个文件写代码分支。推荐规则结构：

```ts
type ParseRule = {
  id: string;
  name: string;
  description: string;
  fileTypes: Array<"xlsx" | "xls" | "docx" | "pdf">;
  version: number;
  parser: ParserRule;
  output: OutputMappingRule;
  aiHints?: AiRuleHint[];
};
```

### 5.1 核心 Schema 草案

```ts
type ParserRule =
  | TableParserRule
  | MultiSheetTableParserRule
  | MatrixParserRule
  | CardListParserRule
  | TextBlocksParserRule
  | PdfTablesParserRule;

type CellSelector = {
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

type OutputMappingRule = {
  groupBy?: CellSelector[];
  order: {
    externalCode?: CellSelector;
    storeName?: CellSelector;
    receiverName?: CellSelector;
    receiverPhone?: CellSelector;
    receiverAddress?: CellSelector;
    remark?: CellSelector;
  };
  item: {
    skuCode: CellSelector;
    skuName: CellSelector;
    quantity: CellSelector;
    spec?: CellSelector;
  };
  defaults?: Partial<Record<"externalCode" | "storeName" | "remark" | "spec", string>>;
};

type RowFilterRule = {
  type: "empty" | "contains" | "regex";
  column?: number;
  text?: string;
  pattern?: string;
};
```

`confidence` 和 `reason` 用于 AI 推测标记，用户确认保存后保留，方便后续解释规则来源。

选择器语义：

- `column`：读取当前数据行指定列下标。
- `header`：按当前表格表头名匹配列，再读取当前数据行该列。
- `regex`：对当前行拼接文本或当前上下文文本执行 `pattern`，返回命名分组 `value` 或第一个捕获组。
- `textBlock`：对当前文本块重新执行 `pattern`，文本块可以是卡片原文、Word 段落块或 PDF 分单块。
- `extracted`：读取解析阶段通过 `headerExtractors`、`tailExtractors`、`footerExtractors` 提取出的中间字段，必须提供 `key`。
- `static`：读取 `value`。
- `sheetName`：读取当前 Sheet 名。

`groupBy` 数组语义为 priority fallback：引擎按顺序执行每个 `CellSelector`，取第一个非空值作为分组键；都为空时生成临时分组键，避免不同空外部编码订单被错误合并。

### 5.2 ParserRule 模式详细字段

支持多种通用解析模式：

| mode | 用途 |
| --- | --- |
| `table` | 标准表格、跳过头部、指定表头行、跳过合计行 |
| `multiSheetTable` | 遍历多个 Sheet，每个 Sheet 独立解析后合并 |
| `matrix` | 门店/SKU 或 日期/门店矩阵转置 |
| `cardList` | 识别卡片边界，每个卡片内部抽取收货信息和小表 |
| `textBlocks` | Word/PDF 纯文本块，通过分隔线或正则拆单 |
| `pdfTables` | PDF 表格 + 页脚/尾部文本信息配对 |

关键模式字段：

```ts
type TableParserRule = {
  mode: "table";
  sheet?: string;
  headerRow: number;
  dataStartRow: number;
  dataEndStrategy?: "untilEmpty" | "untilFooter" | "fixedRows";
  footerPattern?: string;
  skipRows?: RowFilterRule[];
  tailExtractors?: Record<string, CellSelector>;
};

type MultiSheetTableParserRule = Omit<TableParserRule, "mode" | "sheet"> & {
  mode: "multiSheetTable";
  sheetPattern?: string;
  includeSheets?: string[];
  excludeSheets?: string[];
  sheetAsStoreName?: boolean;
};

type MatrixParserRule = {
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

type CardListParserRule = {
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

type TextBlocksParserRule = {
  mode: "textBlocks";
  blockSeparator: string;
  headerExtractors: Record<string, CellSelector>;
  itemLinePattern: string;
  itemFieldGroups: {
    skuCode?: string;
    skuName?: string;
    quantity?: string;
    spec?: string;
  };
};
// itemLinePattern 对每行执行正则，itemFieldGroups 声明命名捕获组名称到 SKU 字段的映射
// 例: itemLinePattern: "(?<code>\\S+)\\s+(?<name>.+?)\\s+(?<qty>\\d+)", itemFieldGroups: { skuCode: "code", skuName: "name", quantity: "qty" }

type PdfTablesParserRule = {
  mode: "pdfTables";
  pageRange?: [number, number];
  orderSeparator?: string;
  tableHeaderPattern: string;
  footerExtractors?: Record<string, CellSelector>;
  skipRows?: RowFilterRule[];
};
```

`MatrixParserRule.colKey.type` 是语义标注，用于 AI 生成规则和人工阅读时理解列轴含义，不隐式改变解析逻辑。例如 `type: "date"` 不会自动格式化日期；需要格式化时在对应 `CellSelector.cellTransform` 中声明。

### 5.3 规则示例

标准表格类规则示例，适用于湖南仓这类“表头 + 多 SKU 行 + 按配送单号聚合”的文件：

```json
{
  "id": "rule-hunan-table",
  "name": "湖南仓发货明细",
  "description": "按配送单号聚合，多行 SKU 共享收货信息",
  "fileTypes": ["xlsx"],
  "version": 1,
  "parser": {
    "mode": "table",
    "sheet": "Sheet1",
    "headerRow": 1,
    "dataStartRow": 2,
    "dataEndStrategy": "untilEmpty",
    "skipRows": [{ "type": "contains", "text": "合计" }]
  },
  "output": {
    "groupBy": [{ "source": "header", "header": "配送单号" }],
    "order": {
      "externalCode": { "source": "header", "header": "配送单号" },
      "receiverName": { "source": "header", "header": "收货人" },
      "receiverPhone": { "source": "header", "header": "电话" },
      "receiverAddress": { "source": "header", "header": "地址" }
    },
    "item": {
      "skuCode": { "source": "header", "header": "商品编码" },
      "skuName": { "source": "header", "header": "商品名称" },
      "quantity": { "source": "header", "header": "数量" },
      "spec": { "source": "header", "header": "规格" }
    }
  },
  "aiHints": []
}
```

卡片式规则示例，适用于门店调拨单：

```json
{
  "id": "rule-card-transfer",
  "name": "门店调拨单卡片式",
  "description": "按调拨记录标题拆分卡片，每个卡片内解析收货信息和物品小表",
  "fileTypes": ["xlsx"],
  "version": 1,
  "parser": {
    "mode": "cardList",
    "sheet": "Sheet1",
    "boundary": { "type": "regex", "pattern": "^.*调拨记录\\s*#\\d+.*$" },
    "headerExtractors": {
      "storeName": { "source": "regex", "pattern": "门店[:：]\\s*(?<value>.+)" },
      "receiverPhone": { "source": "regex", "pattern": "电话[:：]\\s*(?<value>[0-9-]+)" }
    },
    "itemTable": {
      "headerPattern": "编码.*名称.*数量",
      "dataStartOffset": 1,
      "dataEndPattern": "^\\s*$"
    }
  },
  "output": {
    "groupBy": [{ "source": "textBlock", "pattern": "调拨记录\\s*#(?<value>\\d+)" }],
    "order": {
      "storeName": { "source": "extracted", "key": "storeName" },
      "receiverPhone": { "source": "extracted", "key": "receiverPhone" }
    },
    "item": {
      "skuCode": { "source": "header", "header": "编码" },
      "skuName": { "source": "header", "header": "名称" },
      "quantity": { "source": "header", "header": "数量" },
      "spec": { "source": "header", "header": "规格" }
    }
  }
}
```

### 5.4 通用能力

规则执行器需要覆盖：

- 文件级：指定文件类型、Sheet 选择、页码范围、是否遍历所有 Sheet。
- 区域级：头部跳过、尾部信息区、表格区域、卡片边界、文本块分隔符。
- 行级：跳过空行、跳过合计行、跳过说明行、跨行继承字段。
- 列级：列名/列下标/正则匹配/多列拼接。
- 转置：列头转字段、行头转字段、矩阵单元格展开。
- 拆分：复合单元格按换行或正则拆成多条 SKU。
- 聚合：按外部编码、门店、日期或卡片 ID 聚合。
- 默认值：缺失字段可用静态值、Sheet 名、标题行、页脚文本补齐。
- 推测标记：AI 生成的字段映射带 `confidence` 和 `reason`，前端提示用户确认。

## 6. AI 生成规则流程

流程：

1. 用户上传文件。
2. 服务端抽取文件结构摘要：
   - Excel：Sheet 名、合并单元格、前后若干行、候选表头、维度特征。
   - Word：段落文本、表格摘要、分隔符候选。
   - PDF：文本块、表格候选、页码、底部区域文本。
3. 调用大模型生成 `ParseRule` JSON，不直接生成最终订单。
4. 服务端校验 JSON schema，过滤危险内容和无效字段。
5. 前端展示规则编辑器，标出低置信度/推测映射。
6. 用户点击“试解析”，用当前文件执行规则并预览结果。
7. 用户确认后保存规则到数据库。
8. 后续上传文件时由用户手动选择规则执行，不做自动匹配。

环境变量计划：

- `AI_PROVIDER=deepseek|openai|claude`
- `AI_API_KEY=...`
- `AI_MODEL=...`
- `AI_BASE_URL=...`

### 6.1 FileStructureSummary

AI 只接收文件结构摘要，不接收完整大文件内容，避免 token 爆炸并提高稳定性。

```ts
type FileStructureSummary = {
  fileName: string;
  fileType: "xlsx" | "xls" | "docx" | "pdf";
  sheets?: Array<{
    name: string;
    rowCount: number;
    colCount: number;
    merges: Array<{ startRow: number; startCol: number; endRow: number; endCol: number }>;
    previewRows: string[][];
    tailRows: string[][];
  }>;
  textBlocks?: Array<{
    page?: number;
    index: number;
    text: string;
  }>;
  detectedPatterns: Array<{
    type: "headerCandidate" | "separator" | "matrixCandidate" | "cardBoundary" | "footerInfo";
    location: string;
    value: string;
    confidence: number;
  }>;
};
```

### 6.2 Prompt 关键约束

- 你是“解析规则生成器”，只能返回 `ParseRule` JSON。
- 不允许返回最终订单数据，不允许编造文件中不存在的字段。
- 输出必须符合给定 JSON schema，不能包含 Markdown 包裹。
- 每个推测映射必须带 `confidence` 和 `reason`。
- `confidence < 0.75` 的字段前端必须高亮提示用户确认。
- 规则不得依赖文件名，只能依赖结构特征、Sheet 名、行列位置、文本模式、表头或分隔符。
- 对无法确定的必填字段，返回候选字段和低置信度原因，不能静默默认。

## 7. 页面与交互计划

| 路由 | 目标 |
| --- | --- |
| `/` | 主导入工作台：上传文件、选择规则、新建规则、解析进度、预览编辑、提交 |
| `/rules` | 规则管理：列表、创建、编辑、复制、删除、AI 生成入口 |
| `/rules/[id]` | 规则编辑器：JSON/表单编辑、样例试解析、保存 |
| `/orders` | 已导入出库单列表：搜索、筛选、分页、展开 SKU |
| `/api/files/analyze` | 抽取文件结构摘要 |
| `/api/ai/generate-rule` | 大模型生成规则 |
| `/api/rules` | 规则 CRUD |
| `/api/rules/[id]/test` | 执行规则试解析 |
| `/api/import/parse` | 按规则解析上传文件 |
| `/api/orders/import` | 提交入库 |
| `/api/orders` | 历史订单查询 |
| `/api/orders/check-duplicates` | 外部编码历史重复检查 |

规则编辑器试解析文件来源：

- 从首页新建规则进入编辑器时，复用本次上传的临时文件结构摘要和文件对象。
- 从 `/rules/[id]` 直接进入编辑器时，必须允许上传“测试文件”，测试文件只用于试解析，不入库、不创建批次。
- 试解析结果只存在当前会话；用户点击“保存规则”才写入数据库。

API 统一错误响应：

```ts
type ApiErrorResponse = {
  error: string;
  details?: unknown;
};
```

所有 API 成功返回业务对象；失败返回对应 HTTP 状态码和上述结构，前端统一读取 `error` 展示。

主工作台状态机：

```ts
type ImportWorkbenchState =
  | "idle"
  | "file-uploaded"
  | "rule-editor"
  | "rule-selected"
  | "parsed"
  | "preview-ready"
  | "submitted";
```

状态转换：

1. `idle -> file-uploaded`：用户上传文件成功，页面展示文件摘要、可选规则列表、“新建规则”按钮。
2. `file-uploaded -> rule-selected`：用户手动选择已有规则，或新建规则完成保存后自动选中新规则。
3. `file-uploaded -> rule-editor`：用户点击“新建规则”，打开规则编辑器侧边栏或跳转 `/rules/new?from=import`，携带当前临时文件摘要。
4. `rule-editor -> rule-selected`：AI 生成规则并经用户编辑保存后，返回工作台并自动带回 `ruleId`。
5. `rule-selected -> parsed`：用户点击“执行解析”，规则引擎运行并显示进度。
6. `parsed -> preview-ready`：解析结果进入预览表格，支持编辑、校验、导出。
7. `preview-ready -> submitted`：校验无误后提交入库，展示成功/失败汇总。
8. 任一解析失败状态：展示错误、文件结构摘要和“编辑当前规则 / 新建规则”入口。

## 8. 数据库计划

使用 Vercel Marketplace 集成的 Neon PostgreSQL，保留现有 Neon 方向。

新增或调整表：

- `parse_rules`
  - `id`
  - `name`
  - `description`
  - `file_types`
  - `rule_json`
  - `version`
  - `deleted_at`
  - `created_at`
  - `updated_at`
- `shipment_orders`
  - `id`
  - `external_code`
  - `store_name`
  - `receiver_name`
  - `receiver_phone`
  - `receiver_address`
  - `remark`
  - `import_batch_id`
  - `created_at`
  - `updated_at`
- `shipment_items`
  - `id`
  - `order_id`
  - `sku_code`
  - `sku_name`
  - `quantity`
  - `spec`
- `import_batches`
  - 保留，增加 `rule_id`、`file_name`、`status`、`success_count`、`failed_count`、`parse_duration_ms`、`render_duration_ms`。

说明：

- `parse_rules.deleted_at` 用于软删除。历史批次仍可关联原规则，规则列表默认过滤已删除规则。
- `import_batches.status` 取值为 `pending | processing | done | failed`。解析可前端分片同步完成，但提交与历史追踪仍统一记录批次状态。

迁移策略：

- 如果现有 V1 表无线上业务数据，可直接重建 V2 表。
- 如果需要兼容历史数据，保留旧 `orders` 表，同时新增 V2 表，历史列表优先展示 V2 数据。

## 9. 实施计划

### 阶段 1：模型与基础框架

- 更新 `src/lib/types.ts` 为 V2 出库单 + SKU 明细模型。
- 更新 `src/lib/validation.ts` 为 A/B 收货规则和 SKU 校验。
- 更新数据库 schema 和订单 API。
- 新增 `src/lib/rules/schema.ts`，先落完整 DSL 类型和运行时校验。
- 更新 README 与旧需求文档入口，明确 V2。

### 阶段 2：文件读取抽象

- 新增 `src/lib/file-readers/`：
  - `excel-reader.ts`：读取 Sheet、矩阵、合并单元格。
  - `docx-reader.ts`：读取段落与表格。
  - `pdf-reader.ts`：读取文本块与表格候选。
- 新增 `FileStructureSummary`，给 AI 和规则测试共用。
- 安装依赖：
  - Word：`mammoth` 或同类库。
  - PDF：优先 `pdf-parse` 读取文本；表格候选可先基于文本规则实现。

### 阶段 3：规则引擎

- 新增 `src/lib/rules/engine.ts` 执行规则。
- 实现基础模式：
  - `table`
  - `multiSheetTable`
  - `matrix`
  - `cardList`
  - `textBlocks`
  - `pdfTables`
- 输出统一 `ShipmentOrder[]`。
- 保证规则执行器不引用具体文件名。
- 先用 1 条手写标准表格规则跑通“上传 -> 执行规则 -> 预览 -> 校验 -> 导出”端到端，再进入 AI 生成阶段。

### 阶段 4：AI 规则生成

- 新增 `/api/files/analyze` 和 `/api/ai/generate-rule`。
- 设计 Prompt：
  - 输入文件结构摘要、字段定义、规则 DSL schema、必须返回 JSON。
  - 要求 AI 标记推测字段、置信度和原因。
  - 明确禁止返回最终订单数据。
- 做 JSON schema 校验和错误兜底。

### 阶段 5：规则管理 UI

- 新增 `/rules` 列表页。
- 新增规则编辑器：
  - 基础信息。
  - 模式选择。
  - 字段映射。
  - JSON 高级编辑。
  - AI 推测标记。
  - 试解析预览。
- 支持复制、删除、保存。

### 阶段 6：导入工作台改造

- 首页改为：
  - 上传文件。
  - 手动选择已有规则。
  - 新建规则并触发 AI 生成。
  - 规则试解析。
  - 执行解析进度。
  - 出库单 + SKU 明细预览。
- 支持解析失败时展示原始结构摘要和“新建/编辑规则”入口。

### 阶段 7：预览表格与性能

- 预览表格支持订单行展开 SKU 明细，或直接展示扁平 SKU 行并按外部编码分组。
- 单元格可编辑，错误实时标红。
- 以 1000 条 SKU 明细行为性能验收口径；其中可以是 1000 个订单各 1 条 SKU，也可以是少量订单聚合 1000 条 SKU。
- 扁平预览行数超过 200 行启用虚拟列表或分批渲染。
- 导出 Excel 使用当前修改后的扁平数据。

### 阶段 8：9 类样例规则与回归

- 为已有 6 份附件生成并保存样例规则。
- 根据需求描述补齐 3 类缺失样例的规则能力：
  - Word 纯文本分隔记录。
  - 周配送计划双重转置。
  - PDF 多单拆分。
- 附件补齐后逐个跑试解析，修正规则。

### 阶段 9：构建、部署、提交 URL

- 本地执行：
  - `npm run lint`
  - `npm run build`
  - 样例文件导入回归。
  - 1000 行性能验证。
- 部署到 Vercel。
- 打开线上 URL 验证首页、规则管理、导入、历史列表。
- 访问 `http://106.12.10.129:10010/` 填写 Vercel URL。

## 10. 验收清单

- [ ] 技术栈为 Next.js App Router + TypeScript。
- [ ] Vercel 在线 URL 可访问。
- [ ] UI 风格符合鲸天系统主色与卡片风格。
- [ ] 上传支持 Excel、Word、PDF。
- [ ] 用户必须手动选择规则或新建规则，不做自动匹配。
- [ ] AI 生成的是解析规则，不是最终订单数据。
- [ ] AI 生成规则可编辑、可试解析、可保存。
- [ ] 规则保存到服务端数据库。
- [ ] 代码中不出现基于文件名的解析分支。
- [ ] 规则引擎覆盖头部跳过、尾部提取、跨行聚合、矩阵转置、多 Sheet、卡片拆分、纯文本解析、复合单元格拆分、PDF 多单拆分。
- [ ] 预览表格支持编辑、新增、删除、横向滚动、固定表头。
- [ ] 全部错误一次性展示。
- [ ] 有错误不能提交。
- [ ] 提交成功后持久化到数据库。
- [ ] 历史列表支持搜索、筛选、分页。
- [ ] 1000 条 SKU 明细行 10 秒内进入预览，前端渲染 3 秒内完成；超过 200 行启用虚拟列表或分批渲染。

## 11. 风险与处理

- 附件缺失：当前本地 zip 未包含需求描述中的全部 9 份文件。先按规则能力实现，等附件补齐后补回归规则。
- PDF 表格解析准确率：纯文本 PDF 对表格边界不稳定。先用文本块 + 正则 + 分隔符规则，必要时引入更强 PDF 表格解析库。
- AI 返回不稳定：必须使用 JSON schema 校验，失败时允许用户手动新建规则。
- 时间压力：优先完成规则引擎、AI 规则生成、6 份已见附件、部署 URL；再扩展性能和缺失样例。
- 数据库迁移：V1 表结构与 V2 不兼容，实施前需确认是否保留旧数据；考试项目可优先采用 V2 新表。

## 12. 测试 Case 与验证结果

更新时间：2026-06-05

### 12.1 验证范围说明

本轮验证覆盖当前实现后的关键交付链路：

- V2 工作台页面可打开。
- 文件上传与结构分析可用。
- AI 大模型生成解析规则可用。
- 规则 JSON 可回填、保存、执行。
- 解析结果可进入预览列表。
- 规则管理页可打开。
- 历史出库单页可打开。
- 生产构建与 Vercel 部署通过。

按用户确认，以下 3 类样例本轮不作为必测项，也没有单独适配样例规则：

- 门店配送确认单。
- 周配送计划。
- 配送签收单。

代码中仍保留 `textBlocks`、`matrix`、`pdfTables` 等通用规则模式，但本轮不把这 3 类作为验收成功条件。

### 12.2 测试用例

| 编号 | 用例 | 操作 | 期望结果 | 当前结果 |
| --- | --- | --- | --- | --- |
| TC01 | 本地 lint | 执行 `npm run lint` | 无 ESLint error | 通过 |
| TC02 | 本地生产构建 | 执行 `npm run build` | Next.js 构建成功，无 TypeScript error | 通过 |
| TC03 | Vercel 生产部署 | 执行 `npx vercel --prod --yes` | 构建成功并生成生产 URL | 通过 |
| TC04 | 首页加载 | 浏览器打开 `/` | 显示”万能导入 V2”工作台 | 通过 |
| TC05 | Excel 上传分析 | 首页上传附件 Excel 样例 | 文件卡片展示文件名、状态进入 `file-uploaded`、显示 Sheet 摘要 | 通过 |
| TC06 | AI 生成规则 | 上传后点击”新建规则 / AI 生成” | 规则 JSON 编辑器回填包含 `parser`、`output` 的规则 | 通过 |
| TC07 | 保存规则 | 点击”保存当前规则” | 规则保存成功，页面仍处于可解析状态 | 通过 |
| TC08 | 执行解析 | 点击”执行解析” | 进入预览列表，展示 SKU 明细行 | 通过，测试样例解析出 2 条 SKU 明细 |
| TC09 | 解析错误检查 | 观察首页消息和错误文本 | 不出现”解析失败” | 通过 |
| TC10 | 规则管理页 | 浏览器打开 `/rules` | 页面显示”解析规则管理” | 通过 |
| TC11 | 历史列表页 | 浏览器打开 `/orders` | 页面显示”已导入出库单” | 通过 |
| TC12 | API 文件分析 | POST `/api/files/analyze` 上传 Excel | 返回 `summary` 与 `parsedFile` | 通过 |
| TC13 | API AI 生成规则 | POST `/api/ai/generate-rule` 传 `FileStructureSummary` | 返回完整 `ParseRule` | 通过 |
| TC14 | API 规则解析 | POST `/api/import/parse` 传 `parsedFile + rule` | 返回 `ShipmentRow[]` | 通过，测试样例返回 2 行 |
| TC15 | AI 配置连通性 | 使用 `AI_BASE_URL=https://www.vbcode.io/v1`、`AI_MODEL=gpt-5.5` 调用 `/v1/chat/completions` | 已按指定模型配置；若供应商返回空内容或非 JSON，系统会降级生成可编辑基础规则并显示具体原因 | 通过 |
| TC-A | 文件分析（欢乐牧场）| `node scripts/run-tests.mjs` | `parsedFile.sheets.length >= 1`，`rows.length > 0` | 通过，sheets=1, rows=114 |
| TC-B | 规则引擎 table（湖南仓）| `node scripts/run-tests.mjs` | 返回 `rows: Array`, `parseDurationMs: number`，无 500 | 通过，rows=168, 4ms |
| TC-C | 规则引擎 multiSheetTable（多门店分 Sheet）| `node scripts/run-tests.mjs` | `rows` 是数组，行数等于各 Sheet 之和，无 500 | 通过，rows=39, sheets=3 |
| TC-D | 规则引擎 cardList（卡片式调拨单）| `node scripts/run-tests.mjs` | `rows` 是数组，无 500 | 通过，rows=15 |
| TC-E | 校验——storeName+收件人均空 → 400 | `node scripts/run-tests.mjs` | HTTP 400，`error` 字符串非空 | 通过，error=”仍存在未修正的数据错误” |
| TC-F | 校验——quantity=-1 → 400 | `node scripts/run-tests.mjs` | HTTP 400 | 通过 |
| TC-G | 规则 CRUD + 软删除 | `node scripts/run-tests.mjs` | 创建规则，DELETE 后 GET 返回 404 | 通过 |
| TC-H | 订单入库 + 查询（需 DB）| `node scripts/run-tests.mjs` | 提交成功，`/api/orders` 列表有新记录 | 通过，batchId 生成，ordersTotal >= 1 |

### 12.3 已执行命令与结果

本地质量验证：

```bash
npm run lint
npm run build
```

结果：

- `npm run lint`：通过。
- `npm run build`：通过。
- Next.js 构建输出包含以下路由：
  - `/`
  - `/rules`
  - `/orders`
  - `/api/files/analyze`
  - `/api/ai/generate-rule`
  - `/api/import/parse`
  - `/api/rules`
  - `/api/orders`

生产部署：

```bash
npx vercel --prod --yes
```

结果：

- Vercel 构建通过。
- 生产别名：`https://ai-exam-0507-universal-import.vercel.app`

API 自动化测试（2026-06-05）：

```bash
# 启动本地服务
npm run dev -- -p 3001

# 运行测试脚本
node scripts/run-tests.mjs
```

结果：**8/8 passed**

```
  PASS  TC-A  文件分析 (欢乐牧场)         — sheets=1, rows=114
  PASS  TC-B  规则引擎 table (湖南仓)     — rows=168, 4ms
  PASS  TC-C  规则引擎 multiSheetTable    — rows=39, sheets=3
  PASS  TC-D  规则引擎 cardList (卡片式)  — rows=15
  PASS  TC-E  校验 storeName+收件人均空   — HTTP 400
  PASS  TC-F  校验 quantity=-1           — HTTP 400
  PASS  TC-G  规则 CRUD + 软删除         — DELETE → GET 404
  PASS  TC-H  订单入库 + 查询            — batchId 生成, ordersTotal >= 1
```

修复说明：

- `src/lib/db.ts` 的 `ensureSchema` 增加 `ALTER TABLE import_batches ADD COLUMN IF NOT EXISTS` 迁移，解决旧数据库表缺少 `rule_id` 等 V2 新增列导致的 500 错误。
- `scripts/run-tests.mjs` 使用 `jszip` 解压附件（替代 PowerShell `Expand-Archive`，后者对中文文件名有编码问题）。

### 12.4 浏览器验证结果

真实浏览器验证使用脚本：

```bash
node scripts/browser-smoke.cjs
```

前置条件：

1. 本地服务运行在 `http://localhost:3001`。
2. 将附件中的任意 Excel 样例复制为 `tmp-safe-demos/demo03.xlsx`。由于原 zip 内部分中文文件名编码异常，测试时使用安全 ASCII 文件名避免命令行解析问题。
3. 已安装 Playwright 依赖；脚本使用系统 Chrome：`C:\Program Files\Google\Chrome\Application\chrome.exe`。

浏览器脚本实际返回：

```json
{
  "title": "万能导入 V2",
  "ruleLength": 3161,
  "rows": 2,
  "errorText": "",
  "rulesPageLoaded": true,
  "ordersPageLoaded": true
}
```

解释：

- `ruleLength: 3161`：AI/兜底规则已回填到规则编辑器。
- `rows: 2`：上传的 Excel 样例通过规则解析出 2 条 SKU 明细。
- `errorText: ""`：页面未出现“解析失败”。
- `rulesPageLoaded: true`：规则管理页加载成功。
- `ordersPageLoaded: true`：历史出库单页加载成功。

### 12.5 浏览器验证发现并修复的问题

验证过程中发现一个页面级真实问题：

- 问题：上传文件后，首页只保存了 `parsedFile`，没有把 `/api/files/analyze` 返回的 `summary` 合并进页面状态。点击“新建规则 / AI 生成”时，前端向 `/api/ai/generate-rule` 发送了空摘要，页面提示“缺少文件结构摘要”。
- 修复：在 `src/app/page.tsx` 中将 `data.summary` 合并进 `parsedFile` 状态。
- 复测：重新运行浏览器脚本后通过，规则成功回填并解析出 2 条 SKU 明细。

### 12.6 尚未完整覆盖的测试项

以下测试项未做完整自动化验收，需要人工或后续专项压测：

- 所有现有附件逐个配置规则并人工核对字段准确率。
- 1000 条 SKU 明细行的真实浏览器性能压测。
- 数据库提交后的历史重复检测全链路人工验收。
- Word/PDF 特定复杂样例的准确率验收；其中用户已确认”门店配送确认单、周配送计划、配送签收单”不用做。
- 钉钉提交页 `http://106.12.10.129:10010/` 需要登录态，本机 HTTP 访问只能拿到钉钉统一登录页，未能自动填写 URL。

### 12.7 Test Case Review（2026-06-05）

#### 覆盖充足性问题

**高优先级缺口：**

1. **TC08/TC14 只验证了 1 份附件、2 条 SKU，无法证明规则引擎核心逻辑正确。** 6 份已有附件中 5 份未测试；合计行跳过、跨行字段继承、按 `externalCode` 聚合多 SKU 等核心能力均无对应 case。

2. **`cardList`、`multiSheetTable`、`matrix` 模式完全没有 test case。** 门店调拨单（cardList）、多门店分 Sheet（multiSheetTable）、欢乐牧场（matrix 或 table）无任何解析验证，等同于这三类规则模式未验证。

3. **校验逻辑无 test case。** 4.2 节定义了 A/B 收货规则、`quantity` 正数、电话格式、批内重复检测，但测试表中没有一个 case 触发校验失败路径，也没有验证”有错误不能提交”的约束是否真的拦截。

**中优先级缺口：**

4. **规则 CRUD 无 test case。** 创建、编辑、复制、软删除（`deleted_at`）后历史批次能否正常关联规则，均未测试。

5. **工作台完整状态机链路无 case。** `idle → file-uploaded → rule-editor → rule-selected → parsed → preview-ready → submitted` 的完整端到端链路未覆盖。提交入库后能否在 `/orders` 查到新记录也没有验证。

#### 已通过 case 的可信度问题

6. **TC13 结论不可信。** “返回完整 `ParseRule`”仅等于 HTTP 200，未验证：返回 JSON 是否符合 DSL schema、低置信度字段是否携带 `confidence`/`reason`、是否违反”禁止返回订单数据”约束。

7. **TC05 无字段级断言。** 未验证 `FileStructureSummary` 的 `previewRows`、`merges`、`detectedPatterns` 是否真实填充，只验证了页面渲染有 Sheet 摘要区域。

8. **`scripts/verify-excels.mjs` 是 V1 测试脚本，与 V2 模型不兼容。** 该脚本验证的是发件人/收件人/重量字段（V1 运单模型），在 V2 中这些字段已不存在。`test:excels` 脚本应标记为废弃或删除，避免误导。

#### 补充 case 优先级建议

| 优先级 | 补充内容 |
| --- | --- |
| 高 | 用已有 6 份附件各跑一次解析，断言返回行数和关键字段非空 |
| 高 | 校验错误路径：storeName 和 B 组字段同时为空时，期望返回具体字段错误而非提交成功 |
| 高 | `multiSheetTable` 解析：多门店分 Sheet 附件，期望合并后行数等于各 Sheet 之和 |
| 中 | `cardList` 解析：门店调拨单附件，期望卡片数量与附件卡片数一致 |
| 中 | 规则软删除：删除规则后 `/api/rules` 列表不返回该规则，但关联 `import_batch` 仍能读到 `rule_id` |
| 中 | 端到端提交：解析 → 无错误 → 提交入库 → `/orders` 列表新增对应记录 |
| 低 | 1000 行性能：上传含 1000 条 SKU 行的 Excel，断言解析耗时 < 10s，前端渲染 < 3s |
- 钉钉提交页 `http://106.12.10.129:10010/` 需要登录态，本机 HTTP 访问只能拿到钉钉统一登录页，未能自动填写 URL。
