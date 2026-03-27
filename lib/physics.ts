export const LANES = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;

export type Lane = (typeof LANES)[number];

export const SCALE_MIN = 0;
export const SCALE_MAX = 2;
export const SCALE_STEP = 0.1;

export function clampScale(scale: number): number {
  return Math.max(SCALE_MIN, Math.min(SCALE_MAX, Number(scale.toFixed(2))));
}

export function laneCenterX(laneWidth: number, lane: Lane): number {
  const index = LANES.findIndex((value) => value === lane);
  const laneIndex = index >= 0 ? index : 0;
  return laneWidth * laneIndex + laneWidth / 2;
}

export function bodySizeFromScale(laneWidth: number, scale: number): { width: number; height: number } {
  const safeScale = clampScale(scale);
  const width = laneWidth * safeScale;
  return { width, height: width };
}
