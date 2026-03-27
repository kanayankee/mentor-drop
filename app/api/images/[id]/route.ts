import { NextRequest, NextResponse } from "next/server";
import { downloadFromDrive } from "@/lib/drive";
import { getFile, hasFile, storeFile } from "@/lib/uploadStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function detectContentType(buffer: Buffer): string {
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  return "application/octet-stream";
}

async function resolveImageBuffer(id: string): Promise<Buffer | null> {
  if (hasFile(id)) {
    return getFile(id) ?? null;
  }

  if (!id.startsWith("img_")) {
    return null;
  }

  const storageKey = id.slice(4);
  if (!storageKey || storageKey.startsWith("local_")) {
    return null;
  }

  const fromDrive = await downloadFromDrive(storageKey);
  if (!fromDrive) {
    return null;
  }

  storeFile(id, fromDrive);
  return fromDrive;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const buffer = await resolveImageBuffer(id);
  if (!buffer) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": detectContentType(buffer),
      "Cache-Control": "public, max-age=3600",
    },
  });
}

export async function HEAD(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return new NextResponse(null, { status: 404 });
  }

  const buffer = await resolveImageBuffer(id);
  if (!buffer) {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(null, {
    status: 200,
    headers: {
      "Content-Type": detectContentType(buffer),
      "Cache-Control": "public, max-age=3600",
    },
  });
}
