import { NextRequest, NextResponse } from "next/server";
import { storeFile } from "@/lib/uploadStore";
import { uploadToDrive } from "@/lib/drive";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const uploadBuffer = Buffer.from(buffer);
    const uploadName = `drop-${Date.now()}-${Math.random().toString(36).substring(2, 13)}.webp`;

    let fileId: string;
    try {
      // Prefer persistent storage and use Drive file id as canonical public id.
      fileId = await uploadToDrive(uploadName, uploadBuffer, "image/webp");
    } catch (err) {
      // Fallback keeps local/dev environments working when Drive is unavailable.
      console.error("Failed to upload to Google Drive, using local fallback:", err);
      fileId = `local-${Date.now()}-${Math.random().toString(36).substring(2, 13)}`;
    }

    // Keep a hot local cache copy for faster subsequent reads in the same runtime.
    storeFile(fileId, uploadBuffer);

    const fileUrl = `/api/upload/${fileId}`;

    return NextResponse.json({ fileUrl }, { status: 200 });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
