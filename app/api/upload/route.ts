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
    const fileId = `${Date.now()}-${Math.random().toString(36).substr(2, 11)}`;

    // Store the file using shared store
    storeFile(fileId, Buffer.from(buffer));

    // Upload to Google Drive asynchronously
    uploadToDrive(`drop-${fileId}.webp`, Buffer.from(buffer), "image/webp").catch((err: unknown) => {
      console.error("Failed to upload to Google Drive:", err);
    });

    const fileUrl = `/api/upload/${fileId}`;

    return NextResponse.json({ fileUrl }, { status: 200 });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
