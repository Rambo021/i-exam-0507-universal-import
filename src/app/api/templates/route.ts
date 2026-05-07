import { NextResponse } from "next/server";
import { hasDatabase, upsertTemplateMapping } from "@/lib/db";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    fingerprint?: string;
    sheetName?: string;
    headerRowIndex?: number;
    mapping?: unknown;
  };

  if (!body.fingerprint || !body.sheetName || body.headerRowIndex === undefined || !body.mapping) {
    return NextResponse.json({ message: "模板映射参数不完整" }, { status: 400 });
  }

  if (!hasDatabase()) {
    return NextResponse.json({ saved: false, databaseReady: false });
  }

  await upsertTemplateMapping({
    fingerprint: body.fingerprint,
    sheetName: body.sheetName,
    headerRowIndex: body.headerRowIndex,
    mapping: body.mapping,
  });

  return NextResponse.json({ saved: true, databaseReady: true });
}
