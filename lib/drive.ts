import { google, drive_v3 } from "googleapis";
import * as stream from "stream";

type ServiceAccount = {
  client_email: string;
  private_key: string;
};

function getServiceAccount(): ServiceAccount {
  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!rawJson) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON env var");
  try {
    return JSON.parse(rawJson) as ServiceAccount;
  } catch {
    const lastBrace = rawJson.lastIndexOf("}");
    if (lastBrace !== -1) {
      return JSON.parse(rawJson.substring(0, lastBrace + 1)) as ServiceAccount;
    }
    throw new Error("Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON");
  }
}

async function getDriveClient(): Promise<drive_v3.Drive> {
  const sa = getServiceAccount();
  const auth = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ["https://www.googleapis.com/auth/drive.file", "https://www.googleapis.com/auth/drive"],
  });
  await auth.authorize();
  return google.drive({ version: "v3", auth });
}

export async function uploadToDrive(fileName: string, buffer: Buffer, mimeType: string = "image/png"): Promise<string> {
  const drive = await getDriveClient();
  const targetFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID || "1uOW73nkT2OuAuLBOweiAZEN4cwfnx-7S";

  const bufferStream = new stream.PassThrough();
  bufferStream.end(buffer);

  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [targetFolderId],
    },
    media: {
      mimeType,
      body: bufferStream,
    },
    fields: "id",
    supportsAllDrives: true,
  });

  const fileId = res.data.id;
  if (!fileId) throw new Error("Failed to upload to Drive, missing fileId");

  return fileId;
}
