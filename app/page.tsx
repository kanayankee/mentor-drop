"use client";

import { useEffect, useRef, useState } from "react";
import { FRAMES } from "@/constants/frames";
import { LANES, SCALE_MAX, SCALE_MIN, SCALE_STEP, clampScale } from "@/lib/physics";

type PostPayload = {
  fileName: string;
  fileUrl: string;
  frameId: string;
  lane: string;
  scale: number;
};

const CLIP_PATHS: Record<string, string> = {
  circle: "circle(50% at 50% 50%)",
  star: "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)",
  square: "inset(0)",
};

function drawClipPath(
  ctx: CanvasRenderingContext2D,
  frameId: string,
  size: number
) {
  ctx.beginPath();
  if (frameId === "circle") {
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  } else if (frameId === "star") {
    const pts = [50, 0, 61, 35, 98, 35, 68, 57, 79, 91, 50, 70, 21, 91, 32, 57, 2, 35, 39, 35];
    ctx.moveTo((pts[0] / 100) * size, (pts[1] / 100) * size);
    for (let i = 2; i < pts.length; i += 2) {
      ctx.lineTo((pts[i] / 100) * size, (pts[i + 1] / 100) * size);
    }
  } else {
    ctx.rect(0, 0, size, size);
  }
  ctx.closePath();
  ctx.clip();
}

export default function PostPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [frameId, setFrameId] = useState<string>("circle");
  const [lane, setLane] = useState<string>("C");
  const [scale, setScale] = useState(1.0);
  const [status, setStatus] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const CAMERA_VIEW_SIZE = 240;

  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  async function initializeCamera() {
    if (streamRef.current) {
      setCameraReady(true);
      setStatus("");
      return;
    }
    try {
      setStatus("カメラを許可してください...");
      const stream = await navigator.mediaDevices
        .getUserMedia({ video: { facingMode: { exact: "environment" } } })
        .catch(() =>
          navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } })
        );
      streamRef.current = stream;
      if (!videoRef.current) { setStatus("ビデオ要素エラー"); return; }
      videoRef.current.srcObject = stream;
      videoRef.current.onloadedmetadata = () => {
        videoRef.current!.play()
          .then(() => { setCameraReady(true); setStatus(""); })
          .catch((e) => setStatus(`再生エラー: ${e.message}`));
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`エラー: ${msg}`);
      setCameraReady(false);
    }
  }

  useEffect(() => {
    if (typeof window !== "undefined" && navigator.mediaDevices) initializeCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => { streamRef.current?.getTracks().forEach((t) => t.stop()); };
  }, []);

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  function updateScale(next: number) { setScale(clampScale(next)); }

  function handleCapture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const size = CAMERA_VIEW_SIZE;
    canvas.width = size;
    canvas.height = size;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    drawClipPath(ctx, frameId, size);
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) { setStatus("カメラがまだ準備できていません"); return; }
    const vAspect = vw / vh;
    let dw = size, dh = size, ox = 0, oy = 0;
    if (vAspect > 1) { dw = size * vAspect; ox = (size - dw) / 2; }
    else { dh = size / vAspect; oy = (size - dh) / 2; }
    ctx.drawImage(video, ox, oy, dw, dh);
    ctx.restore();
    canvas.toBlob((blob) => {
      if (!blob) { setStatus("撮影に失敗しました"); return; }
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewBlob(blob);
      setPreviewUrl(URL.createObjectURL(blob));
      setStatus("");
    }, "image/webp", 0.85);
  }

  function handleRetake() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewBlob(null);
    setPreviewUrl(null);
    setStatus("");
  }

  async function handleSubmit() {
    if (!previewBlob) return;
    setIsSubmitting(true);
    setStatus("投稿中...");
    const formData = new FormData();
    formData.append("file", previewBlob, "capture.webp");
    try {
      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const { fileUrl } = (await uploadRes.json()) as { fileUrl: string };
      const payload: PostPayload = {
        fileName: `capture-${Date.now()}.webp`, fileUrl, frameId, lane, scale,
      };
      const postRes = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (postRes.ok) {
        handleRetake();
        setStatus("✓ 投稿完了！");
        setTimeout(() => setStatus(""), 2000);
      } else {
        const err = (await postRes.json().catch(() => null)) as { error?: string } | null;
        setStatus(`✗ 投稿失敗: ${err?.error ?? "unknown"}`);
      }
    } catch {
      setStatus("✗ エラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  }

  const clipPath = CLIP_PATHS[frameId] ?? "inset(0)";

  return (
    <main style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "20px 16px",
      background: "url('/assets/mobile_bg.webp') center/cover no-repeat",
      fontFamily: "'Avenir Next', 'Hiragino Kaku Gothic ProN', sans-serif",
    }}>
      {/* タイトル */}
      <h1 style={{
        fontSize: "1.8rem", fontWeight: 700, margin: "0 0 16px 0",
        color: "#19150f",
      }}>MentorDrop</h1>

      {/* カメラエリア */}
      <div style={{
        width: `${CAMERA_VIEW_SIZE}px`,
        height: `${CAMERA_VIEW_SIZE}px`,
        position: "relative",
        marginBottom: "16px",
        borderRadius: "16px",
        overflow: "hidden",
        background: "#000",
        flexShrink: 0,
      }}>
        <video
          ref={videoRef}
          autoPlay playsInline muted
          style={{
            width: "100%", height: "100%",
            objectFit: "cover",
            clipPath, WebkitClipPath: clipPath,
            display: previewUrl ? "none" : "block",
          }}
        />
        {previewUrl && (
          <img src={previewUrl} alt="Preview" style={{
            width: "100%", height: "100%",
            objectFit: "cover",
          }} />
        )}
        {!cameraReady && !previewUrl && (
          <button onClick={initializeCamera} style={{
            position: "absolute", inset: 0,
            background: "rgba(255,255,255,0.95)", color: "#19150f",
            border: "none", borderRadius: "16px",
            fontSize: "1.1rem", fontWeight: 700,
            cursor: "pointer",
          }}>
            {status === "カメラを許可してください..." ? "カメラを許可中..." : "📱 カメラを起動"}
          </button>
        )}
      </div>

      {/* アクションボタン行 (カメラの下に固定配置) */}
      <div style={{
        display: "flex", gap: "12px",
        marginBottom: "20px",
        justifyContent: "center",
        width: "100%", maxWidth: "320px",
      }}>
        {cameraReady && !previewUrl && (
          <button onClick={handleCapture} style={{
            flex: 1, padding: "14px",
            background: "rgba(255,255,255,0.95)", color: "#19150f",
            border: "none", borderRadius: "12px",
            fontSize: "1.05rem", fontWeight: 700,
            cursor: "pointer",
          }}>撮影</button>
        )}
        {previewUrl && (
          <>
            <button onClick={handleRetake} disabled={isSubmitting} style={{
              flex: 1, padding: "14px",
              background: "rgba(0,0,0,0.4)", color: "#fff",
              border: "none", borderRadius: "12px",
              fontSize: "1rem", fontWeight: 700,
              cursor: "pointer", opacity: isSubmitting ? 0.5 : 1,
            }}>撮り直す</button>
            <button onClick={handleSubmit} disabled={isSubmitting} style={{
              flex: 1, padding: "14px",
              background: "rgba(255,255,255,0.95)", color: "#19150f",
              border: "none", borderRadius: "12px",
              fontSize: "1rem", fontWeight: 700,
              cursor: "pointer", opacity: isSubmitting ? 0.5 : 1,
            }}>{isSubmitting ? "送信中..." : "投稿する"}</button>
          </>
        )}
      </div>

      {/* コントロールパネル */}
      {!previewUrl && (
        <div style={{
          width: "100%", maxWidth: "320px",
          display: "flex", flexDirection: "column", gap: "14px",
          padding: "20px",
          background: "#fff9ef",
          borderRadius: "16px",
          border: "2px solid #19150f",
        }}>
          {/* フレーム */}
          <div>
            <label style={{ fontWeight: 600, fontSize: "0.9rem", display: "block", marginBottom: "6px" }}>フレーム</label>
            <select value={frameId} onChange={(e) => setFrameId(e.target.value)} style={{
              width: "100%", padding: "10px", borderRadius: "8px",
              border: "1px solid #19150f", fontSize: "0.95rem",
            }}>
              {FRAMES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </div>
          {/* レーン */}
          <div>
            <label style={{ fontWeight: 600, fontSize: "0.9rem", display: "block", marginBottom: "6px" }}>レーン</label>
            <select value={lane} onChange={(e) => setLane(e.target.value)} style={{
              width: "100%", padding: "10px", borderRadius: "8px",
              border: "1px solid #19150f", fontSize: "0.95rem",
            }}>
              {LANES.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          {/* サイズ */}
          <div>
            <label style={{ fontWeight: 600, fontSize: "0.9rem", display: "block", marginBottom: "6px" }}>
              サイズ: {Math.round(scale * 100)}%
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <button type="button" onClick={() => updateScale(scale - SCALE_STEP)}
                disabled={scale <= SCALE_MIN}
                style={{
                  width: "40px", height: "40px", borderRadius: "8px",
                  border: "1px solid #19150f", background: "#fff",
                  fontSize: "1.2rem", fontWeight: 600, cursor: "pointer",
                }}>−</button>
              <input type="range" min={SCALE_MIN} max={SCALE_MAX} step={SCALE_STEP}
                value={scale} onChange={(e) => setScale(clampScale(parseFloat(e.target.value)))}
                style={{ flex: 1 }} />
              <button type="button" onClick={() => updateScale(scale + SCALE_STEP)}
                disabled={scale >= SCALE_MAX}
                style={{
                  width: "40px", height: "40px", borderRadius: "8px",
                  border: "1px solid #19150f", background: "#fff",
                  fontSize: "1.2rem", fontWeight: 600, cursor: "pointer",
                }}>+</button>
            </div>
          </div>
        </div>
      )}

      {/* ステータス */}
      {status && (
        <div style={{
          marginTop: "16px", padding: "10px 16px",
          borderRadius: "8px", textAlign: "center",
          fontSize: "0.95rem", fontWeight: 500,
          background: status.startsWith("✓") ? "rgba(76,175,80,0.1)" :
            status.startsWith("✗") ? "rgba(244,67,54,0.1)" : "rgba(0,0,0,0.05)",
          color: status.startsWith("✓") ? "#2e7d32" :
            status.startsWith("✗") ? "#c62828" : "#19150f",
          width: "100%", maxWidth: "320px",
        }}>{status}</div>
      )}

      <canvas ref={canvasRef} style={{ display: "none" }} />
    </main>
  );
}
