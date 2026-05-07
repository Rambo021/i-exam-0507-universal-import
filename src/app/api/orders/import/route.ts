import { NextResponse } from "next/server";
import { hasDatabase, importOrders } from "@/lib/db";
import { OrderRow } from "@/lib/types";
import { validateRows } from "@/lib/validation";

export async function POST(request: Request) {
  if (!hasDatabase()) {
    return NextResponse.json(
      { message: "DATABASE_URL 未配置，无法持久化运单数据", successCount: 0, failedCount: 0 },
      { status: 503 },
    );
  }

  const body = (await request.json()) as { rows?: OrderRow[] };
  const rows = body.rows ?? [];
  const errors = validateRows(rows);
  if (errors.length) {
    return NextResponse.json({ message: "仍存在未修正的数据错误", errors }, { status: 400 });
  }

  const result = await importOrders(rows);
  return NextResponse.json(result);
}
