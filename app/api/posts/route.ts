import { NextResponse } from "next/server";
import { FRAMES } from "@/constants/frames";
import { LANES, clampScale } from "@/lib/physics";
import { appendSheetRow, ensureSheetHeaders, getSheetRows } from "@/lib/sheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PostRow = {
  id: string;
  fileName: string;
  fileUrl: string;
  frameId: string;
  lane: string;
  scale: number;
  createdAt: string;
};

function isValidPayload(body: unknown): body is {
  fileName: string;
  fileUrl: string;
  frameId: string;
  lane: string;
  scale: number;
} {
  if (!body || typeof body !== "object") {
    return false;
  }

  const payload = body as Record<string, unknown>;
  const validFrame = FRAMES.some((frame) => frame.id === payload.frameId);
  const validLane = LANES.some((lane) => lane === payload.lane);
  const validScale = typeof payload.scale === "number" && payload.scale >= 0 && payload.scale <= 2;

  return (
    validFrame &&
    validLane &&
    validScale &&
    typeof payload.fileName === "string" &&
    typeof payload.fileUrl === "string"
  );
}

export async function GET() {
  try {
    await ensureSheetHeaders();
    const rows = await getSheetRows(100);
    return NextResponse.json({ ok: true, rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[GET /api/posts] Error:", message);
    return NextResponse.json({ error: `Failed to load posts: ${message}` }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const body: unknown = await request.json();

  if (!isValidPayload(body)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const safeScale = clampScale(body.scale);
  const row: PostRow = {
    id: crypto.randomUUID(),
    fileName: body.fileName,
    fileUrl: body.fileUrl,
    frameId: body.frameId,
    lane: body.lane,
    scale: safeScale,
    createdAt: new Date().toISOString()
  };

  try {
    await ensureSheetHeaders();
    await appendSheetRow([
      row.id,
      row.fileName,
      row.fileUrl,
      row.frameId,
      row.lane,
      String(row.scale),
      row.createdAt
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[POST /api/posts] Error:", message);
    console.error("[POST /api/posts] Stack:", err instanceof Error ? err.stack : "");
    return NextResponse.json({ error: `Failed to save post: ${message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, row });
}
