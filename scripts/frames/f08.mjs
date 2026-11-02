import { node, cell, label } from "../lib.mjs";

const screen = (dark) => {
  const font = { fontFamily: "Inter" };
  return node("frame", { name: dark ? "screen dark" : "screen default light", ...(dark ? { theme: { mode: "dark" } } : {}), x: 20, y: 36, width: 500, height: 400, layout: "vertical", gap: "$spacing.md", padding: "$spacing.md", fill: "$color.bg", cornerRadius: "$radius.md" }, [
    node("frame", { name: "header", layout: "horizontal", gap: "$spacing.md", alignItems: "center", width: "fill_container" }, [
      node("text", { name: "title", content: "$app.title", ...font, fontSize: 24, fontWeight: "700", fill: "$color.text" }),
      node("frame", { name: "badge", enabled: "$show.badge", padding: "$spacing.md", cornerRadius: "$radius.md", fill: "$color.primary" }, [
        node("text", { name: "badge text", content: "NEW", ...font, fontSize: 12, fontWeight: "700", fill: "$color.bg" }),
      ]),
    ]),
    node("text", { name: "body", content: "Colors, spacing, radius, title and badge visibility all come from variables.", ...font, fontSize: 14, textGrowth: "fixed-width", width: "fill_container", fill: "$color.text" }),
    node("frame", { name: "card", layout: "vertical", gap: "$spacing.md", padding: "$spacing.md", width: "fill_container", cornerRadius: "$radius.md", fill: "$color.primary" }, [
      node("text", { name: "card text", content: "Card using color.primary", ...font, fontSize: 16, fill: "$color.bg" }),
    ]),
    node("frame", { name: "button", padding: "$spacing.md", cornerRadius: "$radius.md", fill: "$color.text" }, [
      node("text", { name: "button text", content: "Action", ...font, fontSize: 14, fontWeight: "600", fill: "$color.bg" }),
    ]),
  ]);
};

export function frame08() {
  const legend = node("frame", { name: "cell: variables legend", x: 40, y: 40, width: 1120, height: 90, layout: "none" }, [
    label("document variables + theme axis legend", 1120),
    node("text", { name: "legend", x: 0, y: 24, content: "color: color.bg, color.text, color.primary (values per theme axis mode: light | dark)\nnumber: spacing.md = 16, radius.md = 12   |   string: app.title = Test App   |   boolean: show.badge = true", fontFamily: "JetBrains Mono", fontSize: 12, fill: "#111827", lineHeight: 1.5 }),
  ]);
  const backdrop = (x, text, dark) => node("frame", { name: "cell: " + text, x, y: 150, width: 540, height: 460, fill: "#E5E7EB", layout: "none" }, [
    node("text", { name: "label", x: 20, y: 10, content: text, fontFamily: "Inter", fontSize: 12, fill: "#6B7280", textGrowth: "fixed-width", width: 500 }),
    screen(dark),
  ]);
  return [legend, backdrop(40, "default screen (no theme set -> light)", false), backdrop(600, "same screen with theme { mode: dark }", true)];
}
