"use client";

import Link from "next/link";
import { ChangeEvent, DragEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Download,
  FileUp,
  History,
  Loader2,
  Plus,
  Save,
  Send,
  Settings2,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { exportShipments } from "@/lib/excel";
import { ParseRule, ParsedFile } from "@/lib/rules/schema";
import { ShipmentField, ShipmentRow, fieldConfigs } from "@/lib/types";
import { formatError, validateRows } from "@/lib/validation";

type ProgressState = {
  label: string;
  processed: number;
  total: number;
};

type WorkbenchState = "idle" | "file-uploaded" | "rule-selected" | "parsed" | "preview-ready" | "submitted";

type ToastState = {
  type: "success" | "error" | "info";
  message: string;
};

type RuleListItem = {
  id: string;
  name: string;
  description: string;
  ruleJson?: ParseRule;
};

const emptyRow = (): ShipmentRow =>
  ({
    id: crypto.randomUUID(),
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
  });

function progressPercent(progress: ProgressState | null) {
  if (!progress || !progress.total) return 0;
  return Math.round((progress.processed / progress.total) * 100);
}

function loadLocalRules(): ParseRule[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem("parseRulesV2") ?? "[]") as ParseRule[];
  } catch {
    return [];
  }
}

function saveLocalRule(rule: ParseRule) {
  const rules = loadLocalRules().filter((item) => item.id !== rule.id);
  window.localStorage.setItem("parseRulesV2", JSON.stringify([rule, ...rules].slice(0, 40)));
}

function localRuleFromList(item: RuleListItem) {
  return item.ruleJson ?? loadLocalRules().find((rule) => rule.id === item.id) ?? null;
}

function parseRuleDraftText(ruleDraft: string): ParseRule {
  const trimmed = ruleDraft.trim();
  if (!trimmed) {
    throw new Error("规则 JSON 为空，请先选择规则或点击“新建规则 / AI 生成”。");
  }
  if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html") || trimmed.startsWith("<")) {
    throw new Error("规则编辑器内容是 HTML 页面，不是规则 JSON。请重新点击“新建规则 / AI 生成”。");
  }
  try {
    return JSON.parse(trimmed) as ParseRule;
  } catch (error) {
    throw new Error(`规则 JSON 格式错误：${error instanceof Error ? error.message : "无法解析"}`);
  }
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`接口返回非 JSON（HTTP ${response.status}）：${text.slice(0, 120)}`);
  }
}

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<WorkbenchState>("idle");
  const [parsedFile, setParsedFile] = useState<ParsedFile | null>(null);
  const [rules, setRules] = useState<RuleListItem[]>([]);
  const [selectedRuleId, setSelectedRuleId] = useState("");
  const [ruleDraft, setRuleDraft] = useState("");
  const [rows, setRows] = useState<ShipmentRow[]>([]);
  const [historicalDuplicates, setHistoricalDuplicates] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState<ToastState | null>(null);
  const [submitNotice, setSubmitNotice] = useState<ToastState | null>(null);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [fileName, setFileName] = useState("");
  const [parseDurationMs, setParseDurationMs] = useState<number | undefined>();
  const [renderStartedAt, setRenderStartedAt] = useState(0);
  const [previewPage, setPreviewPage] = useState(1);
  const [previewPageSize, setPreviewPageSize] = useState(100);

  const errors = useMemo(() => validateRows(rows, historicalDuplicates), [rows, historicalDuplicates]);
  const errorsByCell = useMemo(() => {
    const map = new Map<string, string[]>();
    errors.forEach((error) => {
      const key = `${error.rowId}:${error.field}`;
      map.set(key, [...(map.get(key) ?? []), error.message]);
    });
    return map;
  }, [errors]);
  const totalPreviewPages = Math.max(1, Math.ceil(rows.length / previewPageSize));
  const currentPreviewPage = Math.min(previewPage, totalPreviewPages);
  const previewStartIndex = (currentPreviewPage - 1) * previewPageSize;
  const visibleRows = rows.slice(previewStartIndex, previewStartIndex + previewPageSize);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        const localRules = loadLocalRules();
        const localItems = localRules.map((rule) => ({
          id: rule.id,
          name: rule.name,
          description: rule.description,
          ruleJson: rule,
        }));
        setRules(localItems);
        const response = await fetch("/api/rules").catch(() => null);
        if (!response) return;
        const data = await readJsonResponse(response);
        if (Array.isArray(data.rules)) {
          const remoteItems = data.rules.map((item: { id: string; name: string; description: string; ruleJson?: ParseRule }) => ({
            id: item.id,
            name: item.name,
            description: item.description,
            ruleJson: item.ruleJson,
          }));
          setRules([...remoteItems, ...localItems.filter((local) => !remoteItems.some((remote: RuleListItem) => remote.id === local.id))]);
        }
      })();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function showToast(type: ToastState["type"], text: string) {
    setToast({ type, message: text });
  }

  async function handleFile(file?: File) {
    if (!file) return;
    setMessage("");
    setRows([]);
    setPreviewPage(1);
    setSelectedRuleId("");
    setRuleDraft("");
    setProgress({ label: "分析文件结构", processed: 0, total: 1 });
    setIsBusy(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/files/analyze", { method: "POST", body: formData });
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(data.error ?? "文件分析失败");
      setParsedFile({ ...(data.parsedFile as Omit<ParsedFile, "summary">), summary: data.summary } as ParsedFile);
      setFileName(file.name);
      setState("file-uploaded");
      setMessage(`${file.name} 已上传，已生成结构摘要。请选择已有规则或新建规则。`);
    } catch (error) {
      setState("idle");
      setMessage(error instanceof Error ? error.message : "文件上传失败");
    } finally {
      setProgress(null);
      setIsBusy(false);
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    void handleFile(event.target.files?.[0]);
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    void handleFile(event.dataTransfer.files?.[0]);
  }

  function selectRule(ruleId: string) {
    setSelectedRuleId(ruleId);
    const rule = rules.find((item) => item.id === ruleId);
    const parsedRule = rule ? localRuleFromList(rule) : null;
    setRuleDraft(parsedRule ? JSON.stringify(parsedRule, null, 2) : "");
    if (ruleId) setState("rule-selected");
  }

  async function generateRule() {
    if (!parsedFile) return;
    setIsBusy(true);
    setProgress({ label: "AI 生成规则", processed: 0, total: 1 });
    setMessage("");
    setRuleDraft("");
    try {
      const response = await fetch("/api/ai/generate-rule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: parsedFile.summary }),
      });
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(data.error ?? "AI 生成规则失败");
      const rule = data.rule as ParseRule;
      setRuleDraft(JSON.stringify(rule, null, 2));
      setSelectedRuleId(rule.id);
      setRules((current) => [{ id: rule.id, name: rule.name, description: rule.description, ruleJson: rule }, ...current.filter((item) => item.id !== rule.id)]);
      setState("rule-selected");
      if (data.aiStatus === "missing_key") {
        setMessage("未配置 AI Key，已生成可编辑基础规则，请确认字段映射后保存。");
      } else if (data.aiStatus === "provider_error") {
        setMessage(`AI 服务调用失败，已生成可编辑基础规则。${data.aiError ? `原因：${data.aiError}` : ""}`);
      } else if (data.aiStatus === "invalid_rule") {
        setMessage(`AI 已调用，但返回规则未通过校验，已生成可编辑基础规则。${data.aiError ? `原因：${data.aiError}` : ""}`);
      } else {
        setMessage("AI 已生成推荐规则，请确认推测字段后保存。");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI 生成规则失败");
    } finally {
      setProgress(null);
      setIsBusy(false);
    }
  }

  async function saveRule() {
    try {
      const rule = parseRuleDraftText(ruleDraft);
      const response = await fetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rule }),
      });
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(data.error ?? "规则保存失败");
      saveLocalRule(data.rule);
      setRules((current) => [{ id: data.rule.id, name: data.rule.name, description: data.rule.description, ruleJson: data.rule }, ...current.filter((item) => item.id !== data.rule.id)]);
      setSelectedRuleId(data.rule.id);
      setState("rule-selected");
      setMessage(data.databaseReady === false ? "规则已保存到浏览器本地，数据库未配置。" : "规则已保存。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "规则保存失败");
    }
  }

  async function parseWithRule() {
    if (!parsedFile || !ruleDraft) return;
    setIsBusy(true);
    setProgress({ label: "执行解析规则", processed: 0, total: 1 });
    setMessage("");
    try {
      const rule = parseRuleDraftText(ruleDraft);
      const response = await fetch("/api/import/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parsedFile, rule }),
      });
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(data.error ?? "解析失败");
      setRenderStartedAt(performance.now());
      setRows(data.rows);
      setPreviewPage(1);
      setParseDurationMs(data.parseDurationMs);
      setState("preview-ready");
      setMessage(`解析完成：${data.rows.length} 条 SKU 明细，解析耗时 ${data.parseDurationMs}ms。`);
    } catch (error) {
      setState("parsed");
      setMessage(error instanceof Error ? error.message : "解析失败，请编辑规则后重试。");
    } finally {
      setProgress(null);
      setIsBusy(false);
    }
  }

  function updateCell(rowId: string, field: ShipmentField, value: string) {
    setRows((current) => current.map((row) => (row.id === rowId ? { ...row, [field]: value } : row)));
  }

  function handleCellKeyDown(event: KeyboardEvent<HTMLInputElement>, rowIndex: number, fieldIndex: number) {
    if (event.key !== "Tab" && event.key !== "Enter") return;
    event.preventDefault();
    const nextFieldIndex = event.shiftKey ? fieldIndex - 1 : fieldIndex + 1;
    const nextRowIndex = nextFieldIndex >= fieldConfigs.length ? rowIndex + 1 : nextFieldIndex < 0 ? rowIndex - 1 : rowIndex;
    const normalizedFieldIndex = nextFieldIndex >= fieldConfigs.length ? 0 : nextFieldIndex < 0 ? fieldConfigs.length - 1 : nextFieldIndex;
    document.querySelector<HTMLInputElement>(`[data-cell="${nextRowIndex}-${normalizedFieldIndex}"]`)?.focus();
  }

  async function checkHistoricalDuplicates() {
    const codes = rows.map((row) => row.externalCode).filter(Boolean);
    const response = await fetch("/api/orders/check-duplicates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codes }),
    });
    const data = (await readJsonResponse(response)) as { duplicates?: string[] };
    const duplicates = new Set(data.duplicates ?? []);
    setHistoricalDuplicates(duplicates);
    return duplicates;
  }

  async function submitRows() {
    setIsBusy(true);
    setSubmitNotice(null);
    setProgress({ label: "提交下单", processed: 0, total: rows.length || 1 });
    try {
      const duplicates = await checkHistoricalDuplicates();
      const currentErrors = validateRows(rows, duplicates);
      if (currentErrors.length) {
        const text = `仍存在 ${currentErrors.length} 条错误，请先修正后再提交。`;
        setMessage(text);
        setSubmitNotice({ type: "error", message: text });
        showToast("error", text);
        return;
      }
      const response = await fetch("/api/orders/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows,
          ruleId: selectedRuleId,
          fileName,
          parseDurationMs,
          renderDurationMs: renderStartedAt ? Math.round(performance.now() - renderStartedAt) : undefined,
        }),
      });
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(data.error ?? "提交失败");
      setState("submitted");
      const text = `提交完成：成功 ${data.successCount} 条，失败 ${data.failedCount} 条。`;
      setMessage(text);
      setSubmitNotice({ type: data.failedCount ? "error" : "success", message: text });
      showToast(data.failedCount ? "error" : "success", text);
    } catch (error) {
      const text = error instanceof Error ? error.message : "提交失败";
      setMessage(text);
      setSubmitNotice({ type: "error", message: text });
      showToast("error", text);
    } finally {
      setProgress(null);
      setIsBusy(false);
    }
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#eef3f6] text-slate-950">
      {toast ? (
        <div className="fixed right-5 top-5 z-50 w-[360px] max-w-[calc(100vw-40px)] border border-slate-200 bg-white px-4 py-3 shadow-lg">
          <div className="flex items-start gap-3">
            <div
              className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${
                toast.type === "success" ? "bg-[#12b8b5] text-white" : toast.type === "error" ? "bg-red-500 text-white" : "bg-slate-700 text-white"
              }`}
            >
              {toast.type === "error" ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold">{toast.type === "error" ? "提交失败" : toast.type === "success" ? "提交成功" : "提示"}</div>
              <div className="mt-1 break-words text-sm text-slate-600">{toast.message}</div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex min-h-screen min-w-0">
        <aside className="hidden w-[220px] shrink-0 bg-[#063044] text-slate-100 lg:block">
          <div className="flex h-[68px] items-center gap-3 border-b border-white/10 px-6">
            <div className="flex size-9 items-center justify-center rounded bg-[#12b8b5] text-lg font-bold text-white">ZT</div>
            <div>
              <div className="text-lg font-semibold leading-tight">中通冷链</div>
              <div className="text-xs uppercase tracking-wide text-cyan-100/80">ZTO Cold Chain</div>
            </div>
          </div>
          <nav className="px-3 py-5 text-sm">
            {["首页", "运营运输管理", "经营管理中心", "运营操作管理"].map((item) => (
              <div key={item} className="mb-1 rounded px-4 py-3 text-slate-300">{item}</div>
            ))}
            <div className="mb-1 rounded bg-[#0b8190] px-4 py-3 font-medium text-white">财务管理</div>
            <div className="mb-1 rounded px-4 py-3 text-slate-300">基础管理</div>
            <div className="mb-1 rounded px-4 py-3 text-slate-300">服务质量</div>
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="shrink-0 bg-gradient-to-r from-[#07a7a9] to-[#056985] text-white shadow-sm">
            <div className="flex h-[68px] min-w-0 items-center justify-between px-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm text-cyan-50/90">
                  <span>财务管理</span>
                  <span>/</span>
                  <span>万能导入</span>
                </div>
                <h1 className="mt-1 truncate text-lg font-semibold">万能导入 V2</h1>
              </div>
              <div className="flex shrink-0 gap-2">
                <Link href="/rules" className="inline-flex h-9 items-center gap-2 rounded border border-white/30 bg-white/10 px-3 text-sm font-medium hover:bg-white/20">
                  <Settings2 size={16} />
                  规则管理
                </Link>
                <Link href="/orders" className="inline-flex h-9 items-center gap-2 rounded border border-white/30 bg-white/10 px-3 text-sm font-medium hover:bg-white/20">
                  <History size={16} />
                  已导入出库单
                </Link>
              </div>
            </div>
          </header>

          <div className="border-b border-slate-200 bg-white px-5">
            <div className="flex h-12 items-center gap-6 text-sm">
              <span className="text-slate-500">首页</span>
              <span className="text-slate-500">出库单导入</span>
              <span className="border-b-2 border-[#12b8b5] py-[15px] font-medium text-[#079a98]">万能导入 V2</span>
            </div>
          </div>

          <div className="grid min-w-0 flex-1 gap-4 overflow-hidden p-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-4">
          <section
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            className={`border border-dashed bg-white p-4 transition ${isDragging ? "border-[#12b8b5] bg-cyan-50" : "border-slate-300"}`}
          >
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded bg-[#12b8b5] text-white">
                <FileUp size={22} />
              </div>
              <div>
                <h2 className="font-semibold">上传文件</h2>
                <p className="mt-1 text-sm text-slate-500">支持 .xlsx / .xls / .docx / .pdf</p>
              </div>
            </div>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.docx,.pdf" className="hidden" onChange={onFileChange} />
            <button
              type="button"
              disabled={isBusy}
              onClick={() => fileInputRef.current?.click()}
              className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded bg-[#12b8b5] px-4 text-sm font-medium text-white hover:bg-[#0da4a1] disabled:opacity-60"
            >
              {isBusy ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />}
              选择或拖拽文件
            </button>
            {parsedFile ? (
              <div className="mt-4 rounded border border-cyan-100 bg-cyan-50 p-3 text-sm text-cyan-950">
                <div className="font-medium">{parsedFile.fileName}</div>
                <div className="mt-1">状态：{state}</div>
                <div className="mt-1">结构：{parsedFile.sheets.length ? `${parsedFile.sheets.length} 个 Sheet` : `${parsedFile.textBlocks.length} 个文本块`}</div>
              </div>
            ) : null}
          </section>

          <section className="border border-slate-200 bg-white p-4">
            <h2 className="font-semibold">解析规则</h2>
            <select
              value={selectedRuleId}
              disabled={!parsedFile}
              onChange={(event) => selectRule(event.target.value)}
              className="mt-3 h-9 w-full rounded border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="">手动选择规则</option>
              {rules.map((rule) => (
                <option key={rule.id} value={rule.id}>
                  {rule.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!parsedFile || isBusy}
              onClick={generateRule}
              className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded border border-[#12b8b5] px-4 text-sm font-medium text-[#078f8c] hover:bg-cyan-50 disabled:opacity-50"
            >
              <WandSparkles size={16} />
              新建规则 / AI 生成
            </button>
            <button
              type="button"
              disabled={!ruleDraft}
              onClick={saveRule}
              className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded border border-slate-300 px-4 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              <Save size={16} />
              保存当前规则
            </button>
            <button
              type="button"
              disabled={!parsedFile || !ruleDraft || isBusy}
              onClick={parseWithRule}
              className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded bg-[#12b8b5] px-4 text-sm font-medium text-white hover:bg-[#0da4a1] disabled:opacity-50"
            >
              <Bot size={16} />
              执行解析
            </button>
          </section>

          {progress ? (
            <section className="border border-slate-200 bg-white p-4">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium">{progress.label}</span>
                <span className="text-slate-500">{progressPercent(progress)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full bg-[#0fc6c2]" style={{ width: `${progressPercent(progress)}%` }} />
              </div>
            </section>
          ) : null}
        </aside>

        <div className="min-w-0 space-y-4 overflow-hidden">
          {message ? (
            <section className="flex items-center gap-2 border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-900">
              <CheckCircle2 size={16} />
              {message}
            </section>
          ) : null}

          <section className="min-w-0 overflow-hidden border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="font-semibold">规则 JSON 编辑器</h2>
              <p className="mt-1 text-sm text-slate-500">AI 生成后请确认低置信度字段，保存后再执行解析。</p>
            </div>
            <textarea
              value={ruleDraft}
              onChange={(event) => setRuleDraft(event.target.value)}
              className="h-64 w-full resize-y border-0 p-4 font-mono text-sm outline-none"
              placeholder="上传文件后选择规则，或点击 AI 生成规则。"
            />
          </section>

          {rows.length ? (
            <section className="min-w-0 overflow-hidden border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                <div>
                  <h2 className="font-semibold">预览列表</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    共 {rows.length} 条 SKU 明细，错误 {errors.length} 条。当前显示第 {previewStartIndex + 1}-{Math.min(previewStartIndex + visibleRows.length, rows.length)} 条。
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setRows((current) => [...current, emptyRow()]);
                      setPreviewPage(Math.max(1, Math.ceil((rows.length + 1) / previewPageSize)));
                    }}
                    className="inline-flex h-8 items-center gap-2 rounded border border-slate-300 px-3 text-sm font-medium hover:bg-slate-50"
                  >
                    <Plus size={15} />
                    新增行
                  </button>
                  <button type="button" onClick={() => exportShipments(rows)} className="inline-flex h-8 items-center gap-2 rounded border border-slate-300 px-3 text-sm font-medium hover:bg-slate-50">
                    <Download size={15} />
                    导出 Excel
                  </button>
                  <button type="button" disabled={isBusy} onClick={submitRows} className="inline-flex h-8 items-center gap-2 rounded bg-[#12b8b5] px-3 text-sm font-medium text-white hover:bg-[#0da4a1] disabled:opacity-60">
                    {isBusy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                    提交下单
                  </button>
                </div>
              </div>

              {submitNotice ? (
                <div
                  className={`mx-4 mt-3 flex items-center gap-2 border px-3 py-2 text-sm ${
                    submitNotice.type === "success"
                      ? "border-cyan-200 bg-cyan-50 text-cyan-900"
                      : "border-red-200 bg-red-50 text-red-800"
                  }`}
                >
                  {submitNotice.type === "success" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                  <span>{submitNotice.message}</span>
                </div>
              ) : null}

              {errors.length ? (
                <div className="border-b border-red-200 bg-red-50 px-4 py-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-800">
                    <AlertTriangle size={16} />
                    全部错误
                  </div>
                  <div className="grid max-h-32 gap-1 overflow-auto text-sm text-red-800 md:grid-cols-2 xl:grid-cols-3">
                    {errors.map((error, index) => (
                      <div key={`${error.rowId}-${error.field}-${index}`}>{formatError(error)}</div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="max-h-[560px] max-w-full overflow-auto">
                <table className="w-max min-w-full border-collapse text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-100">
                    <tr>
                      <th className="sticky left-0 z-20 w-16 min-w-16 border-b border-r border-slate-200 bg-slate-100 px-2 py-2 text-left">行</th>
                      {fieldConfigs.map((field) => (
                        <th key={field.key} className="border-b border-r border-slate-200 px-2 py-2 text-left font-semibold" style={{ width: field.width, minWidth: field.width }}>
                          {field.label}
                        </th>
                      ))}
                      <th className="w-24 border-b border-slate-200 px-2 py-2 text-left">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row, rowIndex) => (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="sticky left-0 border-b border-r border-slate-200 bg-white px-2 py-1 text-slate-500">{previewStartIndex + rowIndex + 1}</td>
                        {fieldConfigs.map((field, fieldIndex) => {
                          const cellErrors = errorsByCell.get(`${row.id}:${field.key}`) ?? [];
                          const absoluteRowIndex = previewStartIndex + rowIndex;
                          return (
                            <td key={field.key} className="border-b border-r border-slate-200 p-1 align-top">
                              <input
                                data-cell={`${absoluteRowIndex}-${fieldIndex}`}
                                value={row[field.key]}
                                title={cellErrors.join("；")}
                                onChange={(event) => updateCell(row.id, field.key, event.target.value)}
                                onKeyDown={(event) => handleCellKeyDown(event, absoluteRowIndex, fieldIndex)}
                                className={`h-8 w-full rounded-sm border px-2 outline-none focus:border-[#0fc6c2] ${cellErrors.length ? "border-red-500 bg-red-50 text-red-900" : "border-transparent bg-transparent"}`}
                              />
                              {cellErrors.length ? <div className="mt-1 text-xs text-red-700">{cellErrors[0]}</div> : null}
                            </td>
                          );
                        })}
                        <td className="border-b border-slate-200 p-1">
                          <button type="button" onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))} className="inline-flex h-8 items-center gap-1 rounded px-2 text-sm text-red-700 hover:bg-red-50">
                            <Trash2 size={14} />
                            删除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm">
                <div className="text-slate-500">
                  共 {rows.length} 条，每页
                  <select
                    value={previewPageSize}
                    onChange={(event) => {
                      setPreviewPageSize(Number(event.target.value));
                      setPreviewPage(1);
                    }}
                    className="mx-2 h-8 rounded border border-slate-300 bg-white px-2"
                  >
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                  </select>
                  条
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={currentPreviewPage <= 1}
                    onClick={() => setPreviewPage(1)}
                    className="h-8 rounded border border-slate-300 px-3 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    首页
                  </button>
                  <button
                    type="button"
                    disabled={currentPreviewPage <= 1}
                    onClick={() => setPreviewPage((page) => Math.max(1, page - 1))}
                    className="h-8 rounded border border-slate-300 px-3 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    上一页
                  </button>
                  <span className="px-3 text-slate-600">
                    {currentPreviewPage} / {totalPreviewPages}
                  </span>
                  <button
                    type="button"
                    disabled={currentPreviewPage >= totalPreviewPages}
                    onClick={() => setPreviewPage((page) => Math.min(totalPreviewPages, page + 1))}
                    className="h-8 rounded border border-slate-300 px-3 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    下一页
                  </button>
                  <button
                    type="button"
                    disabled={currentPreviewPage >= totalPreviewPages}
                    onClick={() => setPreviewPage(totalPreviewPages)}
                    className="h-8 rounded border border-slate-300 px-3 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    末页
                  </button>
                </div>
              </div>
            </section>
          ) : null}
        </div>
          </div>
        </div>
      </div>
    </main>
  );
}
