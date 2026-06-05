import { NextResponse } from "next/server";
import { hasDatabase, listRules, upsertRule } from "@/lib/db";
import { validateRule } from "@/lib/rules/schema";

export async function GET() {
  if (!hasDatabase()) {
    return NextResponse.json({ rules: [], databaseReady: false });
  }
  try {
    const rules = await listRules();
    return NextResponse.json({ rules, databaseReady: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "规则查询失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rule = validateRule(body.rule ?? body);
    if (!hasDatabase()) {
      return NextResponse.json({ rule, saved: false, databaseReady: false });
    }
    const saved = await upsertRule(rule);
    return NextResponse.json({ rule: saved, saved: true, databaseReady: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "规则保存失败" }, { status: 400 });
  }
}
