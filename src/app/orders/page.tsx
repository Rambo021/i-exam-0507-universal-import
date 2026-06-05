"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Database, Search } from "lucide-react";
import { ImportedShipmentRow } from "@/lib/types";

type QueryResult = {
  rows: ImportedShipmentRow[];
  total: number;
  page: number;
  pageSize: number;
  databaseReady: boolean;
};

export default function OrdersPage() {
  const [externalCode, setExternalCode] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<QueryResult>({ rows: [], total: 0, page: 1, pageSize: 20, databaseReady: true });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function loadOrders(targetPage = page) {
    setLoading(true);
    setMessage("");
    const params = new URLSearchParams({
      externalCode,
      receiverName,
      startDate,
      endDate,
      page: String(targetPage),
      pageSize: "20",
    });
    const response = await fetch(`/api/orders?${params.toString()}`);
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error ?? "查询失败");
    } else {
      setResult(data as QueryResult);
      setPage(targetPage);
    }
    setLoading(false);
  }

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadOrders(1);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadOrders(1);
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold">已导入出库单</h1>
            <p className="mt-1 text-sm text-slate-500">从数据库读取出库单与 SKU 明细，支持搜索、筛选和分页。</p>
          </div>
          <Link href="/" className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium hover:bg-slate-50">
            <ArrowLeft size={16} />
            返回导入
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-[1440px] space-y-5 px-6 py-5">
        {!result.databaseReady ? (
          <section className="flex items-center gap-2 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <Database size={16} />
            当前未配置 DATABASE_URL。部署到 Vercel 并接入 Neon 后，历史出库单会从数据库读取。
          </section>
        ) : null}
        {message ? <section className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{message}</section> : null}

        <form onSubmit={onSearch} className="grid gap-3 border border-slate-200 bg-white p-4 lg:grid-cols-[1fr_1fr_180px_180px_auto]">
          <label className="text-sm">
            <span className="mb-1 block font-medium">外部编码</span>
            <input value={externalCode} onChange={(event) => setExternalCode(event.target.value)} className="h-10 w-full rounded-md border border-slate-300 px-3" placeholder="例如 PS251222" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">收件人姓名</span>
            <input value={receiverName} onChange={(event) => setReceiverName(event.target.value)} className="h-10 w-full rounded-md border border-slate-300 px-3" placeholder="例如 张三" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">开始日期</span>
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="h-10 w-full rounded-md border border-slate-300 px-3" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">结束日期</span>
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="h-10 w-full rounded-md border border-slate-300 px-3" />
          </label>
          <div className="flex items-end">
            <button type="submit" disabled={loading} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
              <Search size={16} />
              搜索
            </button>
          </div>
        </form>

        <section className="border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <h2 className="font-semibold">SKU 明细记录</h2>
              <p className="mt-1 text-sm text-slate-500">共 {result.total} 条，当前第 {page} / {totalPages} 页</p>
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={page <= 1 || loading} onClick={() => void loadOrders(page - 1)} className="inline-flex h-9 items-center gap-1 rounded-md border border-slate-300 px-3 text-sm disabled:opacity-50">
                <ChevronLeft size={15} />
                上一页
              </button>
              <button type="button" disabled={page >= totalPages || loading} onClick={() => void loadOrders(page + 1)} className="inline-flex h-9 items-center gap-1 rounded-md border border-slate-300 px-3 text-sm disabled:opacity-50">
                下一页
                <ChevronRight size={15} />
              </button>
            </div>
          </div>

          <div className="overflow-auto">
            <table className="min-w-[1500px] border-collapse text-sm">
              <thead className="bg-slate-100">
                <tr>
                  {["外部编码", "收货门店", "收件人", "电话", "地址", "SKU编码", "SKU名称", "数量", "规格", "提交时间", "批次"].map((header) => (
                    <th key={header} className="border-b border-r border-slate-200 px-3 py-2 text-left font-semibold">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={row.itemId} className="hover:bg-slate-50">
                    <td className="border-b border-r border-slate-200 px-3 py-2">{row.externalCode || "-"}</td>
                    <td className="border-b border-r border-slate-200 px-3 py-2">{row.storeName || "-"}</td>
                    <td className="border-b border-r border-slate-200 px-3 py-2">{row.receiverName || "-"}</td>
                    <td className="border-b border-r border-slate-200 px-3 py-2">{row.receiverPhone || "-"}</td>
                    <td className="border-b border-r border-slate-200 px-3 py-2">{row.receiverAddress || "-"}</td>
                    <td className="border-b border-r border-slate-200 px-3 py-2">{row.skuCode}</td>
                    <td className="border-b border-r border-slate-200 px-3 py-2">{row.skuName}</td>
                    <td className="border-b border-r border-slate-200 px-3 py-2">{row.quantity}</td>
                    <td className="border-b border-r border-slate-200 px-3 py-2">{row.spec || "-"}</td>
                    <td className="border-b border-r border-slate-200 px-3 py-2">{row.createdAt ? new Date(row.createdAt).toLocaleString("zh-CN") : "-"}</td>
                    <td className="border-b border-slate-200 px-3 py-2">{row.importBatchId}</td>
                  </tr>
                ))}
                {!result.rows.length ? (
                  <tr>
                    <td colSpan={11} className="px-3 py-10 text-center text-slate-500">
                      暂无数据
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
