export interface Rect { x: number; y: number; w: number; h: number; }
/** A frame with its own box in world coordinates and the ids of the frames above it. */
export interface FrameBox extends Rect { id: string; ancestors: string[]; }

/** Frames a marquee selects: every frame that lies completely inside `area`, but only the outermost ones.
 *  A frame is dropped when one of the frames above it is also completely inside, so a parent stands for its children.
 *  When the parent sticks out of the area, its children inside the area are selected on their own. */
export function outermostEnclosed(frames: FrameBox[], area: Rect, eps = 0.01): string[] {
  const inside = new Set(
    frames
      .filter((f) => f.w > 0 && f.h > 0 && f.x >= area.x - eps && f.y >= area.y - eps && f.x + f.w <= area.x + area.w + eps && f.y + f.h <= area.y + area.h + eps)
      .map((f) => f.id),
  );
  return frames.filter((f) => inside.has(f.id) && !f.ancestors.some((a) => inside.has(a))).map((f) => f.id);
}

/** Rectangle between two corner points, whichever way the drag went. */
export const rectBetween = (a: { x: number; y: number }, b: { x: number; y: number }): Rect => ({
  x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y),
});
