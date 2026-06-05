import { NextResponse } from "next/server";
import { readUploadedFile } from "@/lib/file-readers";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "缺少上传文件" }, { status: 400 });
    }
    const parsed = await readUploadedFile(file);
    return NextResponse.json({
      summary: parsed.summary,
      parsedFile: {
        fileName: parsed.fileName,
        fileType: parsed.fileType,
        sheets: parsed.sheets,
        textBlocks: parsed.textBlocks,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "文件分析失败" }, { status: 400 });
  }
}
