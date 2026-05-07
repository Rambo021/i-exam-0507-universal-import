"use client";

import Link from "next/link";
import { ChangeEvent, DragEvent, KeyboardEvent, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  History,
  Loader2,
  Plus,
  Save,
  Send,
  Trash2,
  Upload,
} from "lucide-react";
import { exportOrders, parseExcelFile, remapRows, saveMapping } from "@/lib/excel";
import { ColumnMapping, MappingDraft, OrderField, OrderRow, ParseResult, fieldConfigs, orderFields } from "@/lib/types";
import { formatError, validateRows } from "@/lib/validation";

type ProgressState = {
  label: string;
  processed: number;
  total: number;
};

const emptyOrder = (): OrderRow =>
  Object.assign(
    { id: crypto.randomUUID() },
    Object.fromEntries(orderFields.map((field) => [field, ""])),
  ) as OrderRow;

function progressPercent(progress: ProgressState | null) {
  if (!progress || !progress.total) return 0;
  return Math.round((progress.processed / progress.total) * 100);
}

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [historicalDuplicates, setHistoricalDuplicates] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const errors = useMemo(() => validateRows(rows, historicalDuplicates), [rows, historicalDuplicates]);
  const errorsByCell = useMemo(() => {
    const map = new Map<string, string[]>();
    errors.forEach((error) => {
      const key = `${error.rowId}:${error.field}`;
      map.set(key, [...(map.get(key) ?? []), error.message]);
    });
    return map;
  }, [errors]);

  async function handleFile(file?: File) {
    if (!file) return;
    setMessage("");
    setHistoricalDuplicates(new Set());
    setProgress({ label: "解析 Excel", processed: 0, total: 1 });

    try {
      const result = await parseExcelFile(file, (processed, total) => {
        setProgress({ label: "解析 Excel", processed, total });
      });
      setParseResult(result);
      setRows(result.rows);
      setMapping(result.mapping);
      setProgress(null);
      setMessage(
        `${file.name} 已导入 ${result.rows.length} 条，Sheet：${result.sheetName}，表头第 ${result.headerRowIndex + 1} 行${
          result.fromMemory ? "，已应用模板记忆" : ""
        }`,
      );
    } catch (error) {
      setProgress(null);
      setMessage(error instanceof Error ? error.message : "导入失败");
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

  function updateCell(rowId: string, field: OrderField, value: string) {
    setRows((current) => current.map((row) => (row.id === rowId ? { ...row, [field]: value } : row)));
  }

  function handleCellKeyDown(event: KeyboardEvent<HTMLInputElement>, rowIndex: number, fieldIndex: number) {
    if (event.key !== "Tab" && event.key !== "Enter") return;
    event.preventDefault();
    const nextFieldIndex = event.shiftKey ? fieldIndex - 1 : fieldIndex + 1;
    const nextRowIndex =
      nextFieldIndex >= fieldConfigs.length ? rowIndex + 1 : nextFieldIndex < 0 ? rowIndex - 1 : rowIndex;
    const normalizedFieldIndex =
      nextFieldIndex >= fieldConfigs.length ? 0 : nextFieldIndex < 0 ? fieldConfigs.length - 1 : nextFieldIndex;
    const selector = `[data-cell="${nextRowIndex}-${normalizedFieldIndex}"]`;
    document.querySelector<HTMLInputElement>(selector)?.focus();
  }

  function changeMapping(field: OrderField, value: string) {
    const next = { ...mapping };
    if (value === "") {
      delete next[field];
    } else {
      next[field] = Number(value);
    }
    setMapping(next);
    if (parseResult) {
      setRows(remapRows(parseResult.sourceRows, next));
    }
  }

  async function persistMapping() {
    if (!parseResult) return;
    const draft: MappingDraft = {
      sheetName: parseResult.sheetName,
      headerRowIndex: parseResult.headerRowIndex,
      headers: parseResult.headers,
      fingerprint: parseResult.fingerprint,
      mapping,
      fromMemory: true,
      confidence: 1,
    };
    saveMapping(draft);
    setMessage("模板映射已保存。下次上传相同或相似结构会自动应用。");
    await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    }).catch(() => undefined);
  }

  async function checkHistoricalDuplicates() {
    const codes = rows.map((row) => row.externalCode).filter(Boolean);
    const response = await fetch("/api/orders/check-duplicates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codes }),
    });
    const data = (await response.json()) as { duplicates: string[]; databaseReady: boolean };
    const duplicates = new Set(data.duplicates);
    setHistoricalDuplicates(duplicates);
    return duplicates;
  }

  async function submitOrders() {
    setIsSubmitting(true);
    setMessage("");
    setProgress({ label: "提交下单", processed: 0, total: rows.length || 1 });

    try {
      const duplicates = await checkHistoricalDuplicates();
      const currentErrors = validateRows(rows, duplicates);
      if (currentErrors.length) {
        setMessage("仍存在错误行，请先修正后再提交。");
        return;
      }

      for (let index = 0; index < rows.length; index += 1) {
        if (index % 25 === 0 || index === rows.length - 1) {
          setProgress({ label: "提交下单", processed: index + 1, total: rows.length });
        }
      }

      const response = await fetch("/api/orders/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "提交失败");
      }
      setMessage(`提交完成：成功 ${data.successCount} 条，失败 ${data.failedCount} 条。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "提交失败");
    } finally {
      setIsSubmitting(false);
      setProgress(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold">万能导入下单系统</h1>
            <p className="mt-1 text-sm text-slate-500">多模板 Excel 自动识别、预览编辑、校验入库</p>
          </div>
          <Link
            href="/orders"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium hover:bg-slate-50"
          >
            <History size={16} />
            已导入运单
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-[1440px] space-y-5 px-6 py-5">
        <section
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          className={`border border-dashed px-6 py-7 transition ${
            isDragging ? "border-cyan-500 bg-cyan-50" : "border-slate-300 bg-white"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex size-12 items-center justify-center rounded-md bg-cyan-600 text-white">
                <FileSpreadsheet size={24} />
              </div>
              <div>
                <h2 className="text-base font-semibold">上传 Excel 文件</h2>
                <p className="mt-1 text-sm text-slate-500">支持拖拽或点击上传 .xlsx / .xls，自动识别 5 类测试模板。</p>
              </div>
            </div>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onFileChange} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800"
            >
              <Upload size={16} />
              选择文件
            </button>
          </div>
        </section>

        {progress ? (
          <section className="border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium">{progress.label}</span>
              <span className="text-slate-500">
                {progressPercent(progress)}%（{progress.processed}/{progress.total}）
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-cyan-600" style={{ width: `${progressPercent(progress)}%` }} />
            </div>
          </section>
        ) : null}

        {message ? (
          <section className="flex items-center gap-2 border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-900">
            <CheckCircle2 size={16} />
            {message}
          </section>
        ) : null}

        {parseResult ? (
          <section className="border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="font-semibold">模板映射</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Sheet：{parseResult.sheetName}，表头第 {parseResult.headerRowIndex + 1} 行，字段指纹：
                  {parseResult.fingerprint}
                </p>
              </div>
              <button
                type="button"
                onClick={persistMapping}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-medium hover:bg-slate-50"
              >
                <Save size={15} />
                保存映射记忆
              </button>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
              {fieldConfigs.map((field) => (
                <label key={field.key} className="text-sm">
                  <span className="mb-1 block font-medium">
                    {field.label}
                    {field.required ? <span className="text-red-600"> *</span> : null}
                  </span>
                  <select
                    value={mapping[field.key] ?? ""}
                    onChange={(event) => changeMapping(field.key, event.target.value)}
                    className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"
                  >
                    <option value="">不映射</option>
                    {parseResult.headers.map((header, index) => (
                      <option key={`${header}-${index}`} value={index}>
                        {index + 1}. {header || "空列"}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </section>
        ) : null}

        {rows.length ? (
          <section className="border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="font-semibold">预览列表</h2>
                <p className="mt-1 text-sm text-slate-500">
                  共 {rows.length} 行，错误 {errors.length} 条。表格支持点击编辑、Tab/Enter 切换、横向滚动。
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setRows((current) => [...current, emptyOrder()])}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-medium hover:bg-slate-50"
                >
                  <Plus size={15} />
                  新增行
                </button>
                <button
                  type="button"
                  onClick={() => exportOrders(rows)}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-medium hover:bg-slate-50"
                >
                  <Download size={15} />
                  导出 Excel
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={submitOrders}
                  className="inline-flex h-9 items-center gap-2 rounded-md bg-cyan-700 px-3 text-sm font-medium text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  提交下单
                </button>
              </div>
            </div>

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

            <div className="max-h-[520px] overflow-auto">
              <table className="min-w-[1850px] border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-slate-100">
                  <tr>
                    <th className="sticky left-0 z-20 w-16 border-b border-r border-slate-200 bg-slate-100 px-2 py-2 text-left">
                      行
                    </th>
                    {fieldConfigs.map((field) => (
                      <th
                        key={field.key}
                        className="border-b border-r border-slate-200 px-2 py-2 text-left font-semibold"
                        style={{ width: field.width }}
                      >
                        {field.label}
                      </th>
                    ))}
                    <th className="w-80 border-b border-slate-200 px-2 py-2 text-left">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIndex) => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="sticky left-0 border-b border-r border-slate-200 bg-white px-2 py-1 text-slate-500">
                        {rowIndex + 1}
                      </td>
                      {fieldConfigs.map((field, fieldIndex) => {
                        const cellErrors = errorsByCell.get(`${row.id}:${field.key}`) ?? [];
                        return (
                          <td key={field.key} className="border-b border-r border-slate-200 p-1 align-top">
                            <input
                              data-cell={`${rowIndex}-${fieldIndex}`}
                              value={row[field.key]}
                              title={cellErrors.join("；")}
                              onChange={(event) => updateCell(row.id, field.key, event.target.value)}
                              onKeyDown={(event) => handleCellKeyDown(event, rowIndex, fieldIndex)}
                              className={`h-8 w-full rounded-sm border px-2 outline-none focus:border-cyan-600 ${
                                cellErrors.length
                                  ? "border-red-500 bg-red-50 text-red-900"
                                  : "border-transparent bg-transparent"
                              }`}
                            />
                            {cellErrors.length ? <div className="mt-1 text-xs text-red-700">{cellErrors[0]}</div> : null}
                          </td>
                        );
                      })}
                      <td className="border-b border-slate-200 p-1">
                        <button
                          type="button"
                          onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}
                          className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm text-red-700 hover:bg-red-50"
                        >
                          <Trash2 size={14} />
                          删除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
