import { NextResponse } from "next/server";
import { uploadToDrive } from "@/lib/drive";
import { storeFile } from "@/lib/uploadStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreateImagePayload = {
  fileName: string;
  contentType: string;
  imageBase64: string;
};

function isValidPayload(body: unknown): body is CreateImagePayload {
  if (!body || typeof body !== "object") {
    return false;
  }

  const payload = body as Record<string, unknown>;
  return (
    typeof payload.fileName === "string" &&
    typeof payload.contentType === "string" &&
    typeof payload.imageBase64 === "string"
  );
}

function decodeBase64Image(raw: string): Buffer | null {
  const normalized = raw.includes(",") ? raw.split(",").pop() ?? "" : raw;
  if (!normalized) {
    return null;
  }

  const compact = normalized.replace(/\s/g, "");
  if (!compact || compact.length % 4 === 1 || !/^[A-Za-z0-9+/=]+$/.test(compact)) {
    return null;
  }

  try {
    const buffer = Buffer.from(compact, "base64");
    return buffer.length > 0 ? buffer : null;
  } catch {
    return null;
  }
}

function isWebP(buffer: Buffer): boolean {
  return (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  );
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_image" }, { status: 400 });
  }

  if (!isValidPayload(body)) {
    return NextResponse.json({ error: "invalid_image" }, { status: 400 });
  }

  const imageBuffer = decodeBase64Image(body.imageBase64);
  if (!imageBuffer || !isWebP(imageBuffer)) {
    return NextResponse.json({ error: "invalid_image" }, { status: 400 });
  }

  const driveName = `image-${Date.now()}-${Math.random().toString(36).substring(2, 10)}.webp`;
  let id: string;

  try {
    const driveId = await uploadToDrive(driveName, imageBuffer, "image/webp");
    id = `img_${driveId}`;
  } catch (error) {
    // Keep API available when Drive credentials are missing in local/dev.
    console.error("[POST /api/images] Drive upload failed, using local fallback:", error);
    id = `img_local_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  }

  storeFile(id, imageBuffer);

  return NextResponse.json(
    {
      id,
      imageUrl: `/api/images/${id}`,
    },
    { status: 201 }
  );
}
