import { NextResponse } from "next/server";
import { getRule, hasDatabase } from "@/lib/db";
import { readParsedFileFromPayload } from "@/lib/file-readers";
import { executeRule } from "@/lib/rules/engine";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const body = await request.json();
    if (!body.parsedFile) {
      return NextResponse.json({ error: "缺少测试文件结构" }, { status: 400 });
    }
    const { id } = await context.params;
    const rule = body.rule ?? (hasDatabase() ? await getRule(id) : null);
    if (!rule) {
      return NextResponse.json({ error: "规则不存在或数据库未配置" }, { status: 404 });
    }
    const parsedFile = readParsedFileFromPayload(body.parsedFile);
    const rows = executeRule(parsedFile, rule);
    return NextResponse.json({ rows, summary: parsedFile.summary });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "试解析失败" }, { status: 400 });
  }
}
