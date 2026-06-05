"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Copy, Database, RefreshCw, Trash2 } from "lucide-react";
import { ParseRule } from "@/lib/rules/schema";

type RuleListItem = {
  id: string;
  name: string;
  description: string;
  fileTypes?: string[];
  ruleJson?: ParseRule;
  updatedAt?: string;
};

function loadLocalRules(): ParseRule[] {
  try {
    return JSON.parse(window.localStorage.getItem("parseRulesV2") ?? "[]") as ParseRule[];
  } catch {
    return [];
  }
}

export default function RulesPage() {
  const [rules, setRules] = useState<RuleListItem[]>([]);
  const [selected, setSelected] = useState<RuleListItem | null>(null);
  const [databaseReady, setDatabaseReady] = useState(true);
  const [message, setMessage] = useState("");

  async function loadRules() {
    const localRules = loadLocalRules().map((rule) => ({
      id: rule.id,
      name: rule.name,
      description: rule.description,
      fileTypes: rule.fileTypes,
      ruleJson: rule,
    }));
    const response = await fetch("/api/rules").catch(() => null);
    if (!response) {
      setRules(localRules);
      return;
    }
    const data = await response.json();
    setDatabaseReady(data.databaseReady !== false);
    const remote = Array.isArray(data.rules)
      ? data.rules.map((item: { id: string; name: string; description: string; fileTypes?: string[]; ruleJson?: ParseRule; updatedAt?: string }) => item)
      : [];
    setRules([...remote, ...localRules.filter((local) => !remote.some((item: RuleListItem) => item.id === local.id))]);
  }

  async function deleteRule(rule: RuleListItem) {
    if (!confirm(`确认删除规则：${rule.name}？`)) return;
    const response = await fetch(`/api/rules/${rule.id}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error ?? "删除失败");
      return;
    }
    const localRules = loadLocalRules().filter((item) => item.id !== rule.id);
    window.localStorage.setItem("parseRulesV2", JSON.stringify(localRules));
    setRules((current) => current.filter((item) => item.id !== rule.id));
    setSelected(null);
    setMessage(data.databaseReady === false ? "数据库未配置，已删除浏览器本地规则。" : "规则已软删除。");
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRules();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold">解析规则管理</h1>
            <p className="mt-1 text-sm text-slate-500">规则保存到服务端数据库；数据库未配置时使用浏览器本地规则兜底。</p>
          </div>
          <Link href="/" className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium hover:bg-slate-50">
            <ArrowLeft size={16} />
            返回导入
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1440px] gap-5 px-6 py-5 lg:grid-cols-[420px_1fr]">
        <section className="border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <h2 className="font-semibold">规则列表</h2>
              <p className="mt-1 text-sm text-slate-500">共 {rules.length} 条</p>
            </div>
            <button type="button" onClick={() => void loadRules()} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm hover:bg-slate-50">
              <RefreshCw size={15} />
              刷新
            </button>
          </div>
          {!databaseReady ? (
            <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <Database size={16} />
              当前未配置 DATABASE_URL，规则仅保存在浏览器本地。
            </div>
          ) : null}
          {message ? <div className="border-b border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-900">{message}</div> : null}
          <div className="divide-y divide-slate-100">
            {rules.map((rule) => (
              <button
                type="button"
                key={rule.id}
                onClick={() => setSelected(rule)}
                className={`block w-full px-4 py-3 text-left hover:bg-slate-50 ${selected?.id === rule.id ? "bg-cyan-50" : ""}`}
              >
                <div className="font-medium">{rule.name}</div>
                <div className="mt-1 line-clamp-2 text-sm text-slate-500">{rule.description || "无描述"}</div>
                <div className="mt-2 text-xs text-slate-400">{rule.fileTypes?.join(" / ") || rule.ruleJson?.fileTypes.join(" / ")}</div>
              </button>
            ))}
            {!rules.length ? <div className="px-4 py-10 text-center text-sm text-slate-500">暂无规则，请回到导入页上传文件并生成规则。</div> : null}
          </div>
        </section>

        <section className="border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <h2 className="font-semibold">规则详情</h2>
              <p className="mt-1 text-sm text-slate-500">查看 JSON、复制或删除规则。</p>
            </div>
            {selected ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(JSON.stringify(selected.ruleJson ?? {}, null, 2))}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm hover:bg-slate-50"
                >
                  <Copy size={15} />
                  复制
                </button>
                <button type="button" onClick={() => void deleteRule(selected)} className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm text-red-700 hover:bg-red-50">
                  <Trash2 size={15} />
                  删除
                </button>
              </div>
            ) : null}
          </div>
          <pre className="min-h-[520px] overflow-auto p-4 text-sm text-slate-800">{selected ? JSON.stringify(selected.ruleJson ?? selected, null, 2) : "请选择左侧规则"}</pre>
        </section>
      </div>
    </main>
  );
}
