import { NextResponse } from "next/server";
import { hasDatabase, importShipments } from "@/lib/db";
import { ShipmentRow } from "@/lib/types";
import { validateRows } from "@/lib/validation";

export async function POST(request: Request) {
  if (!hasDatabase()) {
    return NextResponse.json(
      { error: "DATABASE_URL 未配置，无法持久化运单数据", successCount: 0, failedCount: 0 },
      { status: 503 },
    );
  }

  const body = (await request.json()) as {
    rows?: ShipmentRow[];
    ruleId?: string;
    fileName?: string;
    parseDurationMs?: number;
    renderDurationMs?: number;
  };
  const rows = body.rows ?? [];
  const errors = validateRows(rows);
  if (errors.length) {
    return NextResponse.json({ error: "仍存在未修正的数据错误", details: errors }, { status: 400 });
  }

  try {
    const result = await importShipments({
      rows,
      ruleId: body.ruleId,
      fileName: body.fileName,
      parseDurationMs: body.parseDurationMs,
      renderDurationMs: body.renderDurationMs,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "提交失败" }, { status: 500 });
  }
}
