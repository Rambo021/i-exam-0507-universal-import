import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "V2 已改用 /api/rules 管理解析规则，旧模板映射接口不再使用" },
    { status: 410 },
  );
}
