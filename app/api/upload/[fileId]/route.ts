import { NextRequest, NextResponse } from "next/server";
import { getFile, hasFile } from "@/lib/uploadStore";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const { fileId } = await params;

  if (!fileId || !hasFile(fileId)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const buffer = getFile(fileId);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=3600"
    }
  });
}
