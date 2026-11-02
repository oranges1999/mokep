let seq = 0;
export const id = () => "n" + (++seq).toString(36);

export const frameNames = ["01-shapes", "02-fills", "03-stroke-effects", "04-text", "05-layout", "06-transform", "07-components", "08-variables-themes", "09-misc"];

export const node = (type, props, children) => ({ type, id: id(), ...props, ...(children ? { children } : {}) });
export const label = (text, w) => node("text", { name: "label", x: 0, y: 0, content: text, fontFamily: "Inter", fontSize: 12, fill: "#6B7280", textGrowth: "fixed-width", width: w });

export function topFrame(i, children) {
  return node("frame", { name: frameNames[i], x: 1200 + (i % 3) * 1320, y: Math.floor(i / 3) * 1120, width: 1200, height: 1000, fill: "#FFFFFF", layout: "none" }, children);
}

/** Grid cell: layout-none frame with a label; content nodes are placed relative to it. */
export function cell(text, x, y, w, h, content) {
  return node("frame", { name: "cell: " + text, x, y, width: w, height: h, layout: "none" }, [label(text, w), ...content]);
}

export const grid = (i, cols, cw, ch, sx, sy) => [40 + (i % cols) * sx, 40 + Math.floor(i / cols) * sy, cw, ch];
