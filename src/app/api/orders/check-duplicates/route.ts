import { NextResponse } from "next/server";
import { findDuplicateExternalCodes, hasDatabase } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { codes?: string[] };
    if (!hasDatabase()) {
      return NextResponse.json({ duplicates: [], databaseReady: false });
    }

    const duplicates = await findDuplicateExternalCodes(body.codes ?? []);
    return NextResponse.json({ duplicates: Array.from(duplicates), databaseReady: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "重复检测失败" }, { status: 500 });
  }
}
