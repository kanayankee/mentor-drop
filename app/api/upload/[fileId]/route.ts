import { NextRequest, NextResponse } from "next/server";
import { downloadFromDrive } from "@/lib/drive";
import { getFile, hasFile, storeFile } from "@/lib/uploadStore";

async function resolveBuffer(fileId: string): Promise<Buffer | null> {
  if (hasFile(fileId)) {
    return getFile(fileId) ?? null;
  }

  const driveBuffer = await downloadFromDrive(fileId);
  if (driveBuffer) {
    storeFile(fileId, driveBuffer);
  }

  return driveBuffer;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const { fileId } = await params;

  if (!fileId) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const buffer = await resolveBuffer(fileId);
  if (!buffer) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=3600"
    }
  });
}

export async function HEAD(
  _request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const { fileId } = await params;

  if (!fileId) {
    return new NextResponse(null, { status: 404 });
  }

  const buffer = await resolveBuffer(fileId);
  if (!buffer) {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(null, {
    status: 200,
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=3600"
    }
  });
}
