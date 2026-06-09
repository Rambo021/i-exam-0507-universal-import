import { NextResponse } from "next/server";
import { matchBuiltInRule } from "@/lib/rules/built-in";
import { FileStructureSummary, ParseRule, validateRule } from "@/lib/rules/schema";

function findHeader(summary: FileStructureSummary) {
  const sheet = summary.sheets?.[0];
  let best = { index: 0, score: -1, row: [] as string[] };
  sheet?.previewRows.forEach((row, index) => {
    const text = row.join("|");
    const score =
      (/(物品|商品|SKU).*(编码|编号)|编码/.test(text) ? 4 : 0) +
      (/(物品|商品|SKU).*(名称)|名称/.test(text) ? 4 : 0) +
      (/(发货数量|数量|订货数量)/.test(text) ? 3 : 0) +
      (/规格|型号/.test(text) ? 1 : 0);
    if (score > best.score) best = { index, score, row };
  });
  return best;
}

function pickHeader(headers: string[], candidates: string[]) {
  return headers.find((header) => candidates.some((candidate) => header.includes(candidate))) ?? candidates[0];
}

function fallbackRule(summary: FileStructureSummary, reason = "系统根据文件结构生成的可编辑基础规则"): ParseRule {
  const firstSheet = summary.sheets?.[0];
  const header = findHeader(summary);
  const headerRow = Math.max(0, header.score > 0 ? header.index : 0);
  const headers = header.row;
  const skuCodeHeader = pickHeader(headers, ["物品编码", "商品编码", "SKU编码", "编码"]);
  const skuNameHeader = pickHeader(headers, ["物品名称", "商品名称", "SKU名称", "名称"]);
  const quantityHeader = pickHeader(headers, ["发货数量", "数量", "订货数量"]);
  const specHeader = pickHeader(headers, ["规格型号", "规格", "型号"]);
  const externalCodeHeader = pickHeader(headers, ["外部编码", "配送单号", "单据号", "订单号"]);
  const storeNameHeader = pickHeader(headers, ["收货门店", "门店", "店铺", "收货机构"]);
  const receiverNameHeader = pickHeader(headers, ["收件人姓名", "收货人姓名", "收件人", "收货人", "联系人"]);
  const receiverPhoneHeader = pickHeader(headers, ["收件人电话", "收货电话", "联系电话", "电话", "手机"]);
  const receiverAddressHeader = pickHeader(headers, ["收件人地址", "收货地址", "地址"]);
  const remarkHeader = pickHeader(headers, ["备注", "说明"]);
  const isSpreadsheet = summary.fileType === "xlsx" || summary.fileType === "xls";
  return validateRule({
    id: crypto.randomUUID(),
    name: `${summary.fileName} 推荐规则`,
    description: reason,
    fileTypes: [summary.fileType],
    version: 1,
    parser:
      isSpreadsheet
        ? {
            mode: "table",
            sheet: firstSheet?.name,
            headerRow,
            dataStartRow: headerRow + 1,
            dataEndStrategy: "untilFooter",
            footerPattern: "合计|单据号|收货人|备注",
            skipRows: [{ type: "contains", text: "合计" }],
            tailExtractors: {
              externalCode: { source: "textBlock", pattern: "单据号\\s*(?<value>[A-Za-z0-9-]+)", confidence: 0.7, reason: "从尾部信息区推测" },
              storeName: { source: "textBlock", pattern: "收货机构\\s*(?<value>[^\\n\\s|]+(?:[^\\n|]*?))\\s+供货机构", confidence: 0.6, reason: "从头部机构信息推测" },
              receiverName: { source: "textBlock", pattern: "收货人\\s*(?<value>[^\\s]+)", confidence: 0.75, reason: "从尾部收货人行推测" },
              receiverPhone: { source: "textBlock", pattern: "收货电话\\s*(?<value>1[3-9]\\d{9}|0\\d{2,3}-?\\d{7,8})", confidence: 0.75, reason: "从尾部电话行推测" },
              receiverAddress: { source: "textBlock", pattern: "收货地址\\s*(?<value>[^\\n]+)", confidence: 0.75, reason: "从尾部地址行推测" },
            },
          }
        : {
            mode: "textBlocks",
            blockSeparator: "[-━]{4,}|\\n\\s*\\n",
            headerExtractors: {
              receiverName: { source: "textBlock", pattern: "收(?:货|件)人[:：]?\\s*(?<value>[^\\n\\s]+)", confidence: 0.55, reason: "启发式识别" },
              receiverPhone: { source: "textBlock", pattern: "(?<value>1[3-9]\\d{9}|0\\d{2,3}-?\\d{7,8})", confidence: 0.55, reason: "启发式识别" },
              receiverAddress: { source: "textBlock", pattern: "地址[:：]?\\s*(?<value>[^\\n]+)", confidence: 0.55, reason: "启发式识别" },
            },
            itemLinePattern: "(?<skuCode>[A-Za-z0-9-]+)\\s*[|｜,，\\s]+(?<skuName>[^|｜,，\\n]+).*?(?<quantity>\\d+(?:\\.\\d+)?)",
          },
    output: {
      groupBy: isSpreadsheet
        ? [{ source: "header", header: externalCodeHeader }]
        : [{ source: "extracted", key: "externalCode" }, { source: "header", header: "外部编码" }, { source: "header", header: "配送单号" }],
      order: {
        externalCode: isSpreadsheet
          ? { source: "header", header: externalCodeHeader, confidence: 0.7, reason: "根据候选表头推测" }
          : { source: "extracted", key: "externalCode", confidence: 0.65, reason: "优先从尾部/头部信息区提取" },
        storeName: isSpreadsheet
          ? { source: "header", header: storeNameHeader, confidence: 0.65, reason: "根据候选表头推测" }
          : { source: "extracted", key: "storeName", confidence: 0.55, reason: "优先从机构信息提取" },
        receiverName: isSpreadsheet
          ? { source: "header", header: receiverNameHeader, confidence: 0.65, reason: "根据候选表头推测" }
          : { source: "extracted", key: "receiverName", confidence: 0.7, reason: "优先从尾部信息区提取" },
        receiverPhone: isSpreadsheet
          ? { source: "header", header: receiverPhoneHeader, cellTransform: "phone", confidence: 0.65, reason: "根据候选表头推测" }
          : { source: "extracted", key: "receiverPhone", confidence: 0.7, reason: "优先从尾部信息区提取" },
        receiverAddress: isSpreadsheet
          ? { source: "header", header: receiverAddressHeader, confidence: 0.65, reason: "根据候选表头推测" }
          : { source: "extracted", key: "receiverAddress", confidence: 0.7, reason: "优先从尾部信息区提取" },
        remark: { source: "header", header: remarkHeader, confidence: 0.5, reason: "根据候选表头推测" },
      },
      item: {
        skuCode: { source: "header", header: skuCodeHeader, confidence: 0.65, reason: "根据候选表头推测" },
        skuName: { source: "header", header: skuNameHeader, confidence: 0.65, reason: "根据候选表头推测" },
        quantity: { source: "header", header: quantityHeader, cellTransform: "number", confidence: 0.65, reason: "根据候选表头推测" },
        spec: { source: "header", header: specHeader, confidence: 0.55, reason: "根据候选表头推测" },
      },
    },
    aiHints: [{ path: "output", confidence: 0.5, reason }],
  });
}

function prompt(summary: FileStructureSummary) {
  return [
    "你是解析规则生成器，只能返回 ParseRule JSON，不要输出 Markdown。",
    "规则不得依赖文件名，只能依赖文件结构、Sheet 名、行列、表头、正则或分隔符。",
    "AI 只生成规则，不允许返回最终订单数据。",
    "每个推测字段必须包含 confidence(0-1) 和 reason。",
    "必填 item.skuCode、item.skuName、item.quantity 必须存在。",
    "groupBy 数组表示 priority fallback。",
    "textBlock 表示对当前文本块执行正则；extracted 表示引用 headerExtractors 的中间字段。",
    "必须按以下骨架返回，所有 key 必须存在：",
    `{
  "id": "string",
  "name": "string",
  "description": "string",
  "fileTypes": ["xlsx"],
  "version": 1,
  "parser": {
    "mode": "table",
    "sheet": "Sheet1",
    "headerRow": 0,
    "dataStartRow": 1,
    "dataEndStrategy": "untilEmpty",
    "skipRows": []
  },
  "output": {
    "groupBy": [{ "source": "header", "header": "外部编码" }],
    "order": {
      "externalCode": { "source": "header", "header": "外部编码", "confidence": 0.8, "reason": "表头匹配" },
      "storeName": { "source": "header", "header": "收货门店", "confidence": 0.8, "reason": "表头匹配" },
      "receiverName": { "source": "header", "header": "收件人姓名", "confidence": 0.8, "reason": "表头匹配" },
      "receiverPhone": { "source": "header", "header": "收件人电话", "confidence": 0.8, "reason": "表头匹配" },
      "receiverAddress": { "source": "header", "header": "收件人地址", "confidence": 0.8, "reason": "表头匹配" },
      "remark": { "source": "header", "header": "备注", "confidence": 0.8, "reason": "表头匹配" }
    },
    "item": {
      "skuCode": { "source": "header", "header": "SKU物品编码", "confidence": 0.8, "reason": "表头匹配" },
      "skuName": { "source": "header", "header": "SKU物品名称", "confidence": 0.8, "reason": "表头匹配" },
      "quantity": { "source": "header", "header": "SKU发货数量", "cellTransform": "number", "confidence": 0.8, "reason": "表头匹配" },
      "spec": { "source": "header", "header": "SKU规格型号", "confidence": 0.8, "reason": "表头匹配" }
    },
    "defaults": {}
  },
  "aiHints": []
}`,
    `FileStructureSummary: ${JSON.stringify(summary).slice(0, 18000)}`,
  ].join("\n");
}

function parseCompletionPayload(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith("data:")) {
    const chunks = trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.replace(/^data:\s*/, ""))
      .filter((line) => line && line !== "[DONE]");
    const contents = chunks
      .map((chunk) => {
        try {
          const parsed = JSON.parse(chunk);
          return parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.message?.content ?? "";
        } catch {
          return "";
        }
      })
      .join("");
    return contents || chunks.at(-1) || "";
  }
  const parsed = JSON.parse(trimmed);
  return parsed.choices?.[0]?.message?.content ?? parsed.choices?.[0]?.delta?.content ?? "";
}

function parseRuleJson(content: string) {
  const trimmed = content.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  try {
    const parsed = JSON.parse(trimmed);
    return parsed.rule ?? parsed;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI 未返回可解析的规则 JSON");
    const parsed = JSON.parse(match[0]);
    return parsed.rule ?? parsed;
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { summary?: FileStructureSummary };
    if (!body.summary) {
      return NextResponse.json({ error: "缺少文件结构摘要" }, { status: 400 });
    }

    const builtInRule = matchBuiltInRule(body.summary);
    if (builtInRule) {
      return NextResponse.json({
        rule: builtInRule,
        aiReady: true,
        aiStatus: "matched_builtin",
      });
    }

    const apiKey = process.env.AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        rule: fallbackRule(body.summary, "未配置 AI Key，系统根据文件结构生成的可编辑基础规则"),
        aiReady: false,
        aiStatus: "missing_key",
      });
    }

    const baseUrl = process.env.AI_BASE_URL || "https://api.openai.com/v1";
    const model = process.env.AI_MODEL || "gpt-4.1-mini";
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      body: JSON.stringify({
        model,
        stream: true,
        messages: [
          { role: "system", content: "Return only valid JSON." },
          { role: "user", content: prompt(body.summary) },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return NextResponse.json({
        rule: fallbackRule(body.summary, `AI 服务返回 ${response.status}，已降级为可编辑基础规则`),
        aiReady: false,
        aiStatus: "provider_error",
        aiError: errorText.slice(0, 500) || `HTTP ${response.status}`,
      });
    }
    const text = await response.text();
    try {
      const content = parseCompletionPayload(text);
      if (!content.trim()) {
        throw new Error("AI 返回内容为空");
      }
      const parsed = parseRuleJson(content);
      return NextResponse.json({ rule: validateRule(parsed), aiReady: true, aiStatus: "ready" });
    } catch (validationError) {
      const message = validationError instanceof Error ? validationError.message : "AI 返回规则不完整，已降级为基础规则";
      return NextResponse.json({
        rule: fallbackRule(body.summary, `AI 返回规则不完整：${message}。已降级为可编辑基础规则`),
        aiReady: false,
        aiStatus: "invalid_rule",
        aiError: message,
      });
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI 生成规则失败" }, { status: 500 });
  }
}
