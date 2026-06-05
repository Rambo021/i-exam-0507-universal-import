import { NextResponse } from "next/server";

export async function GET() {
  const apiKey = process.env.AI_API_KEY ?? "";
  const baseUrl = process.env.AI_BASE_URL ?? "";
  const model = process.env.AI_MODEL ?? "";
  const provider = process.env.AI_PROVIDER ?? "";

  return NextResponse.json({
    provider,
    baseUrl,
    model,
    hasApiKey: apiKey.length > 0,
    apiKeyLength: apiKey.length,
  });
}
