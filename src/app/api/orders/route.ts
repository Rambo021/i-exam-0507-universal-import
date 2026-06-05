import { NextResponse } from "next/server";
import { hasDatabase, queryShipmentRows } from "@/lib/db";

export async function GET(request: Request) {
  if (!hasDatabase()) {
    return NextResponse.json({ rows: [], total: 0, page: 1, pageSize: 20, databaseReady: false });
  }

  try {
    const url = new URL(request.url);
    const result = await queryShipmentRows({
      externalCode: url.searchParams.get("externalCode") ?? "",
      receiverName: url.searchParams.get("receiverName") ?? "",
      startDate: url.searchParams.get("startDate") ?? "",
      endDate: url.searchParams.get("endDate") ?? "",
      page: Number(url.searchParams.get("page") ?? "1"),
      pageSize: Number(url.searchParams.get("pageSize") ?? "20"),
    });

    return NextResponse.json({ ...result, databaseReady: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "查询失败" }, { status: 500 });
  }
}
