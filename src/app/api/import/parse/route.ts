import { NextResponse } from "next/server";
import { readParsedFileFromPayload } from "@/lib/file-readers";
import { executeRule } from "@/lib/rules/engine";
import { validateRule } from "@/lib/rules/schema";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.parsedFile || !body.rule) {
      return NextResponse.json({ error: "缺少 parsedFile 或 rule" }, { status: 400 });
    }
    const parsedFile = readParsedFileFromPayload(body.parsedFile);
    const rule = validateRule(body.rule);
    const startedAt = performance.now();
    const rows = executeRule(parsedFile, rule);
    const parseDurationMs = Math.round(performance.now() - startedAt);
    return NextResponse.json({ rows, summary: parsedFile.summary, parseDurationMs });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "解析失败" }, { status: 400 });
  }
}
