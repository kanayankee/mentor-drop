import * as fs from "fs";
import * as path from "path";

// ディスクベースのファイルストア (サーバー再起動でも画像が消えない)
const UPLOAD_DIR = path.join(process.cwd(), ".uploads");

// ディレクトリがなければ作成
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export function storeFile(fileId: string, buffer: Buffer) {
  const filePath = path.join(UPLOAD_DIR, fileId);
  fs.writeFileSync(filePath, buffer);

  // 古いファイルのクリーンアップ (500件超えたら古い順に削除)
  try {
    const files = fs.readdirSync(UPLOAD_DIR)
      .map(name => ({ name, time: fs.statSync(path.join(UPLOAD_DIR, name)).mtimeMs }))
      .sort((a, b) => a.time - b.time);
    while (files.length > 500) {
      const oldest = files.shift();
      if (oldest) fs.unlinkSync(path.join(UPLOAD_DIR, oldest.name));
    }
  } catch { /* ignore cleanup errors */ }
}

export function getFile(fileId: string): Buffer | undefined {
  const filePath = path.join(UPLOAD_DIR, fileId);
  if (!fs.existsSync(filePath)) return undefined;
  return fs.readFileSync(filePath);
}

export function hasFile(fileId: string): boolean {
  return fs.existsSync(path.join(UPLOAD_DIR, fileId));
}

export function clearStore() {
  try {
    const files = fs.readdirSync(UPLOAD_DIR);
    for (const f of files) fs.unlinkSync(path.join(UPLOAD_DIR, f));
  } catch { /* ignore */ }
}
