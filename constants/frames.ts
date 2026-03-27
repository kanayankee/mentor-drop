export type FrameId = "circle" | "square" | "star";

export const FRAMES = [
  { id: "circle", label: "丸", file: "circle.svg" },
  { id: "square", label: "四角", file: "square.svg" },
  { id: "star", label: "星", file: "star.svg" }
] as const;
