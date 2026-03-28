"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Matter from "matter-js";
import { LANES, BASE_SCALE_RATIO } from "@/lib/physics";
import { LaneGrid } from "@/components/LaneGrid";

type PostItem = {
  id: string;
  frameId: string;
  lane: string;
  fileUrl: string;
  scale: number;
};

type BodyState = {
  id: string;
  x: number;
  y: number;
  angle: number;
  vx: number;
  vy: number;
  angularVelocity: number;
  frameId: string;
  fileUrl: string;
  scale: number;
};

const CAPTURE_SIZE = 240;
const STORAGE_KEY = "mentordrop_physics_state";
const STORAGE_IDS_KEY = "mentordrop_added_ids";

/* ---------- localStorage helpers ---------- */
function savePhysicsState(engine: Matter.Engine, meta: Map<string, { frameId: string; fileUrl: string; scale: number }>) {
  const bodies = Matter.Composite.allBodies(engine.world).filter(b => !b.isStatic);
  const states: BodyState[] = bodies.map(b => {
    const m = meta.get(b.label) ?? { frameId: "square", fileUrl: "", scale: 1 };
    return {
      id: b.label, x: b.position.x, y: b.position.y, angle: b.angle,
      vx: b.velocity.x, vy: b.velocity.y, angularVelocity: b.angularVelocity,
      frameId: m.frameId, fileUrl: m.fileUrl, scale: m.scale
    };
  });
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(states)); } catch { /* ignore */ }
}

function loadPhysicsState(): BodyState[] {
  try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
}

function loadAddedIds(): Set<string> {
  try { const r = localStorage.getItem(STORAGE_IDS_KEY); return r ? new Set(JSON.parse(r)) : new Set(); } catch { return new Set(); }
}

function saveAddedIds(ids: Set<string>) {
  try { localStorage.setItem(STORAGE_IDS_KEY, JSON.stringify([...ids])); } catch { /* ignore */ }
}

export default function HostPage() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const renderRef = useRef<Matter.Render | null>(null);
  const runnerRef = useRef<Matter.Runner | null>(null);
  const addedIds = useRef(loadAddedIds());
  const itemMetaRef = useRef(new Map<string, { frameId: string; fileUrl: string; scale: number }>());
  const [isReloading, setIsReloading] = useState(false);
  const isReloadingRef = useRef(false);

  const createBody = useCallback((
    x: number, y: number, itemSize: number, frameId: string,
    fileUrl: string, id: string, angle?: number
  ): Matter.Body => {
    const spriteScale = itemSize / CAPTURE_SIZE;
    const ro = { sprite: { texture: fileUrl, xScale: spriteScale, yScale: spriteScale } };
    if (frameId === "circle") {
      return Matter.Bodies.circle(x, y, itemSize / 2, {
        restitution: 0.1, friction: 0.5, density: 0.005, render: ro, label: id
      });
    }
    return Matter.Bodies.rectangle(x, y, itemSize, itemSize, {
      restitution: 0.1, friction: 0.5, density: 0.005,
      angle: angle ?? Math.random() * Math.PI * 2, render: ro, label: id
    });
  }, []);

  /* ---------- 全投稿リロード ---------- */
  const handleReloadAll = useCallback(async () => {
    if (!engineRef.current || isReloadingRef.current) return;
    isReloadingRef.current = true;
    setIsReloading(true);

    // 既存の非静的ボディを全て削除
    const world = engineRef.current.world;
    const existingBodies = Matter.Composite.allBodies(world).filter(b => !b.isStatic);
    for (const b of existingBodies) Matter.World.remove(world, b);
    addedIds.current.clear();
    itemMetaRef.current.clear();
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_IDS_KEY);

    try {
      const res = await fetch("/api/posts", { cache: "no-store" });
      if (!res.ok) { setIsReloading(false); return; }
      const data = (await res.json()) as { rows?: string[][] };
      const rows = data.rows ?? [];

      // rows は新しい順で返ってくるので、逆順にして古い→新しい順に落とす
      const items: PostItem[] = [...rows].reverse().map(row => {
        const raw = parseFloat(row[5]);
        const safeScale = (!isNaN(raw) && raw >= 0 && raw <= 2) ? raw : 1.0;
        return { id: row[0], fileUrl: row[2], frameId: row[3], lane: row[4], scale: safeScale };
      });

      const screenWidth = window.innerWidth;
      const laneWidth = screenWidth / 8;

      // 順序よく少し間隔を空けて落とす
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.scale <= 0) { addedIds.current.add(item.id); continue; }

        // 画像の存在確認
        try {
          const check = await fetch(item.fileUrl, { method: "HEAD" });
          if (!check.ok) { addedIds.current.add(item.id); continue; }
        } catch { addedIds.current.add(item.id); continue; }

        const laneIndex = LANES.indexOf(item.lane as (typeof LANES)[number]);
        const baseX = (laneIndex >= 0 ? laneIndex + 0.5 : 4) * laneWidth;
        const x = baseX + (Math.random() - 0.5) * 20;
        const y = -100 - (i * 60); // 順番に少しずつ上にオフセット
        const itemSize = laneWidth * BASE_SCALE_RATIO * item.scale;

        const body = createBody(x, y, itemSize, item.frameId, item.fileUrl, item.id);
        Matter.World.add(world, body);
        addedIds.current.add(item.id);
        itemMetaRef.current.set(item.id, { frameId: item.frameId, fileUrl: item.fileUrl, scale: item.scale });
      }
      saveAddedIds(addedIds.current);
    } catch (err) {
      console.error("Reload error:", err);
    }
    isReloadingRef.current = false;
    setIsReloading(false);
  }, [createBody]);

  /* ---------- Physics World Init ---------- */
  useEffect(() => {
    if (!sceneRef.current) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const laneWidth = width / 8;

    const engine = Matter.Engine.create();
    const render = Matter.Render.create({
      element: sceneRef.current,
      engine,
      options: {
        width, height,
        wireframes: false,
        background: "transparent",
        pixelRatio: window.devicePixelRatio,
      },
    });

    // Walls
    const wt = 60;
    const ground = Matter.Bodies.rectangle(width / 2, height + wt / 2, width, wt, { isStatic: true, render: { visible: false } });
    const leftWall = Matter.Bodies.rectangle(-wt / 2, height / 2, wt, height * 2, { isStatic: true, render: { visible: false } });
    const rightWall = Matter.Bodies.rectangle(width + wt / 2, height / 2, wt, height * 2, { isStatic: true, render: { visible: false } });
    Matter.World.add(engine.world, [ground, leftWall, rightWall]);

    // Mouse (pixelRatio を合わせないとHiDPIでドラッグ位置がずれる)
    const mouse = Matter.Mouse.create(render.canvas);
    mouse.pixelRatio = window.devicePixelRatio;
    const mc = Matter.MouseConstraint.create(engine, { mouse, constraint: { stiffness: 0.2, render: { visible: false } } });
    Matter.World.add(engine.world, mc);
    render.mouse = mouse;

    // Canvas要素を透明にして背景画像が見えるようにする
    render.canvas.style.background = "transparent";

    // Restore saved state
    const saved = loadPhysicsState();
    for (const s of saved) {
      if (!s.fileUrl) continue;
      const sz = laneWidth * BASE_SCALE_RATIO * s.scale;
      if (sz <= 0) continue;
      const body = createBody(s.x, s.y, sz, s.frameId, s.fileUrl, s.id, s.angle);
      Matter.Body.setVelocity(body, { x: s.vx, y: s.vy });
      Matter.Body.setAngularVelocity(body, s.angularVelocity);
      Matter.World.add(engine.world, body);
      addedIds.current.add(s.id);
      itemMetaRef.current.set(s.id, { frameId: s.frameId, fileUrl: s.fileUrl, scale: s.scale });
    }

    const runner = Matter.Runner.create();
    Matter.Runner.run(runner, engine);
    Matter.Render.run(render);

    engineRef.current = engine;
    renderRef.current = render;
    runnerRef.current = runner;

    // Auto-save every 2s
    const saveInterval = setInterval(() => {
      savePhysicsState(engine, itemMetaRef.current);
      saveAddedIds(addedIds.current);
    }, 2000);

    const handleUnload = () => { savePhysicsState(engine, itemMetaRef.current); saveAddedIds(addedIds.current); };
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      clearInterval(saveInterval);
      window.removeEventListener("beforeunload", handleUnload);
      handleUnload();
      Matter.Render.stop(render);
      Matter.Runner.stop(runner);
      if (render.canvas) render.canvas.remove();
    };
  }, [createBody]);

  /* ---------- Polling ---------- */
  useEffect(() => {
    let active = true;
    async function fetchAndDrop() {
      if (!engineRef.current || !active || isReloadingRef.current) return;

      // World内の既存ボディからaddedIdsを同期 (ホットリロードなどでの不整合防止)
      const existingLabels = Matter.Composite.allBodies(engineRef.current.world)
        .filter(b => !b.isStatic)
        .map(b => b.label);
      for (const label of existingLabels) {
        addedIds.current.add(label);
      }
      try {
        const res = await fetch("/api/posts", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { rows?: string[][] };
        const rows = data.rows ?? [];
        const items: PostItem[] = rows.map(row => {
          const raw = parseFloat(row[5]);
          const safeScale = (!isNaN(raw) && raw >= 0 && raw <= 2) ? raw : 1.0;
          return { id: row[0], fileUrl: row[2], frameId: row[3], lane: row[4], scale: safeScale };
        });
        const world = engineRef.current.world;
        const laneWidth = window.innerWidth / 8;

        for (const item of items) {
          if (addedIds.current.has(item.id)) continue;
          if (item.scale <= 0) { addedIds.current.add(item.id); continue; }
          try {
            const check = await fetch(item.fileUrl, { method: "HEAD" });
            if (!check.ok) { addedIds.current.add(item.id); continue; }
          } catch { addedIds.current.add(item.id); continue; }

          const laneIndex = LANES.indexOf(item.lane as (typeof LANES)[number]);
          const baseX = (laneIndex >= 0 ? laneIndex + 0.5 : 4) * laneWidth;
          const x = baseX + (Math.random() - 0.5) * 20;
          const y = -100 - (Math.random() * 200);
          const itemSize = laneWidth * BASE_SCALE_RATIO * item.scale;
          const body = createBody(x, y, itemSize, item.frameId, item.fileUrl, item.id);
          Matter.World.add(world, body);
          addedIds.current.add(item.id);
          itemMetaRef.current.set(item.id, { frameId: item.frameId, fileUrl: item.fileUrl, scale: item.scale });
        }
      } catch (err) { console.error("Fetch error:", err); }
    }
    fetchAndDrop();
    const id = setInterval(fetchAndDrop, 5000);
    return () => { active = false; clearInterval(id); };
  }, [createBody]);

  return (
    <main style={{
      position: "relative", width: "100%", height: "100vh", overflow: "hidden",
      background: "url('/assets/pc_bg.webp') center/cover no-repeat",
    }}>
      {/* Lane Grid (背面) */}
      <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 1 }}>
        <LaneGrid laneWidthPercent={12.5} />
      </div>

      {/* Matter.js Canvas (前面 - 点線の上) */}
      <div ref={sceneRef} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", zIndex: 2 }} />

      {/* リロードボタン (右上) */}
      <button
        onClick={handleReloadAll}
        disabled={isReloading}
        style={{
          position: "absolute", top: 10, right: 10, zIndex: 20,
          width: "28px", height: "28px",
          background: "rgba(255,255,255,0.8)", border: "none",
          borderRadius: "50%", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
          opacity: isReloading ? 0.4 : 0.7,
          transition: "opacity 200ms",
        }}
        title="全投稿を再読み込み"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#19150f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M23 4v6h-6" /><path d="M1 20v-6h6" />
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
      </button>

      {/* QRコード (右下) */}
      <div style={{
        position: "absolute", bottom: 24, right: 24, zIndex: 10,
        background: "rgba(255,255,255,0.92)", padding: "5px 5px",
        borderRadius: "16px", border: "2px solid #19150f",
        display: "flex", alignItems: "center", gap: "14px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
      }}>
        {/* <span style={{ fontWeight: 700, fontSize: "1.3rem", color: "#19150f", whiteSpace: "nowrap" }}></span> */}
        <img src="/assets/qr.svg" alt="QRコード" width={140} height={140} />
      </div>
    </main>
  );
}
