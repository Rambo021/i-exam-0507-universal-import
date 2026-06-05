import { NextResponse } from "next/server";
import { getRule, hasDatabase, softDeleteRule, upsertRule } from "@/lib/db";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  if (!hasDatabase()) {
    return NextResponse.json({ rule: null, databaseReady: false });
  }
  try {
    const { id } = await context.params;
    const rule = await getRule(id);
    if (!rule) return NextResponse.json({ error: "规则不存在" }, { status: 404 });
    return NextResponse.json({ rule, databaseReady: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "规则查询失败" }, { status: 500 });
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const rule = await upsertRule({ ...(body.rule ?? body), id });
    return NextResponse.json({ rule, saved: true, databaseReady: hasDatabase() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "规则保存失败" }, { status: 400 });
  }
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  if (!hasDatabase()) {
    return NextResponse.json({ deleted: false, databaseReady: false });
  }
  try {
    const { id } = await context.params;
    await softDeleteRule(id);
    return NextResponse.json({ deleted: true, databaseReady: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "规则删除失败" }, { status: 500 });
  }
}
