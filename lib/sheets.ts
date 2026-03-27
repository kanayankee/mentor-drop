import { google, sheets_v4 } from "googleapis";

export const SHEET_HEADERS = ["id", "fileName", "fileUrl", "frameId", "lane", "scale", "createdAt"] as const;

type ServiceAccount = {
  client_email: string;
  private_key: string;
};

type SheetEnv = {
  serviceAccount: ServiceAccount;
  sheetId: string;
  sheetName: string;
};

function getSheetEnv(): SheetEnv {
  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!rawJson) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON env var");
  }

  let serviceAccount: ServiceAccount;
  try {
    serviceAccount = JSON.parse(rawJson) as ServiceAccount;
  } catch {
    // 末尾に余分な文字がある場合のリカバリー
    const lastBrace = rawJson.lastIndexOf("}");
    if (lastBrace !== -1) {
      serviceAccount = JSON.parse(rawJson.substring(0, lastBrace + 1)) as ServiceAccount;
    } else {
      throw new Error("Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON");
    }
  }

  const sheetId = process.env.GOOGLE_SHEET_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME;

  if (!sheetId || !sheetName) {
    throw new Error("Missing GOOGLE_SHEET_ID or GOOGLE_SHEET_NAME");
  }

  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error("Invalid service account: missing client_email or private_key");
  }

  return { serviceAccount, sheetId, sheetName };
}

async function getSheetsClient(): Promise<{ client: sheets_v4.Sheets; env: SheetEnv }> {
  const env = getSheetEnv();
  const auth = new google.auth.JWT({
    email: env.serviceAccount.client_email,
    key: env.serviceAccount.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });

  await auth.authorize();

  return {
    client: google.sheets({ version: "v4", auth }),
    env
  };
}

let headersVerified = false;

export async function ensureSheetHeaders(): Promise<void> {
  if (headersVerified) return;

  const { client, env } = await getSheetsClient();

  const headerRange = `${env.sheetName}!A1:G1`;
  const current = await client.spreadsheets.values.get({
    spreadsheetId: env.sheetId,
    range: headerRange
  });

  const values = current.data.values?.[0] ?? [];
  const hasSameHeaders =
    values.length === SHEET_HEADERS.length && SHEET_HEADERS.every((header, index) => values[index] === header);

  if (hasSameHeaders) {
    headersVerified = true;
    return;
  }

  await client.spreadsheets.values.update({
    spreadsheetId: env.sheetId,
    range: headerRange,
    valueInputOption: "RAW",
    requestBody: {
      values: [Array.from(SHEET_HEADERS)]
    }
  });
  headersVerified = true;
}

export async function appendSheetRow(values: string[]): Promise<void> {
  const { client, env } = await getSheetsClient();

  // サニタイズ: 改行や制御文字を削除
  const sanitizedValues = values.map((val) =>
    val
      .replace(/[\r\n]/g, " ")  // 改行をスペースに置換
      .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, "")  // その他の制御文字を削除
      .trim()
  );

  try {
    await client.spreadsheets.values.append({
      spreadsheetId: env.sheetId,
      range: `${env.sheetName}!A:G`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [sanitizedValues]
      }
    });
  } catch (err) {
    console.error("[appendSheetRow] Failed with sanitized values:", sanitizedValues);
    throw err;
  }
}

export async function getSheetRows(limit = 100): Promise<string[][]> {
  const { client, env } = await getSheetsClient();
  try {
    const res = await client.spreadsheets.values.get({
      spreadsheetId: env.sheetId,
      range: `${env.sheetName}!A2:G`
    });

    const rows = (res.data.values ?? []) as string[][];
    return rows.slice(-limit).reverse();
  } catch (err: any) {
    // シートに行がない場合 (ヘッダーのみの場合など) は空配列を返す
    if (err.message && err.message.includes("exceeds grid limits")) {
      return [];
    }
    console.error("[getSheetRows] Failed to fetch rows:", err);
    throw err;
  }
}
