import { NextResponse } from "next/server";
import { findDuplicateExternalCodes, hasDatabase } from "@/lib/db";

export async function POST(request: Request) {
  const body = (await request.json()) as { codes?: string[] };
  if (!hasDatabase()) {
    return NextResponse.json({ duplicates: [], databaseReady: false });
  }

  const duplicates = await findDuplicateExternalCodes(body.codes ?? []);
  return NextResponse.json({ duplicates: Array.from(duplicates), databaseReady: true });
}
