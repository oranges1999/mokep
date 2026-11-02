# Mokep

Mokep is a VS Code extension that shows `.pen` design files (schema 2.21) in a read-only viewer. An AI agent such as Claude Code edits the design through Mokep's own MCP server, and you watch the result update live and leave comments for the agent.

It is an independent project. It does not copy code, UI or assets from pen.dev.

## What it does

**Viewing**
- Opens `*.pen` files in a canvas. Mouse wheel scrolls, Shift+wheel scrolls sideways, Ctrl+wheel (or a trackpad pinch) zooms. The files are plain JSON; files saved by pen.dev can be encrypted, and Mokep cannot read those.
- Renders frames, shapes, fills, strokes, gradients (including mesh), effects, blend modes, text, icons, images, flex layout, components with overrides, variables and themes.
- Never runs `script` nodes. They are shown as placeholders.
- Element animation is not part of the format and is not rendered. Agents describe it in `metadata: { "type": "animation", "description": "..." }` and the info popup shows that text.

**Two modes** (switch top left, or press `V` and `C`)
- **View:** click a node to see its info in a floating popup: name, type, id, position and size, main properties and all properties.
- **Comment:** click a node and type a comment right there (Ctrl+Enter posts). The comments panel lists every comment of the file, numbers match the pins on the canvas, and you can resolve, reopen or delete them. The agent reads and answers them.

**Around the canvas**
- Search bar at the top (Ctrl+F) finds frames by name or id. The theme select next to it switches the design's own themes (for example `mode: light/dark`), not the extension's look.
- Alt over a node measures the distance to the selected one.
- When the agent edits the file, moved nodes slide, new nodes fade in and changed nodes flash.
- An indicator at the top right shows which agent is working and breathes while it is active.
- Sidebar icon (activity bar) lists recently opened designs, with buttons to create a new design file or open an existing one.

The design-to-code bridge is not built yet.

## Agent tools (MCP)

`mokep_read`, `mokep_edit`, `mokep_lint`, `mokep_open`, `mokep_state`, `mokep_focus`, `mokep_screenshot`, `mokep_status`, `mokep_comments` and `mokep_comment`.

- The tools only work on `.pen` files.
- Edits are written atomically and validated (ids and refs). An edit is blocked while the file has uncommitted git changes, unless the agent acknowledges it. Undo is done with git.
- Screenshots come from the open viewer, so `mokep_screenshot` only works while the file is open in VS Code.
- Each VS Code window runs its own bridge on `127.0.0.1`, protected by a token, and writes a file in `~/.mokep/bridges/`. The MCP server talks to the window that has the file open, or else to the window you used last.
- Comments are stored next to the design as `<name>.pen.comments.json`.

## Install

Mokep is not published to a marketplace. Build the package and install it from a file:

```
npm install
npm run assets      # downloads the bundled fonts and icons
npm run package     # minified build, creates mokep-<version>.vsix
code --install-extension mokep-0.1.0.vsix
```

On first start, Mokep asks in a notification whether to register its MCP server with Claude Code. Nothing runs until you click Install. This needs Node.js 18 or newer and the `claude` CLI on your PATH. You can also run `Mokep: Set up MCP for Claude Code` or `Mokep: Copy MCP setup command` from the command palette.

The registered path is `~/.mokep/mcp-server.js`, a copy that Mokep refreshes on every start, so updating the extension does not break the registration. Start a new Claude Code session after registering so the `mokep_` tools appear.

## Commands

- `Mokep: New design file`, `Mokep: Open design file`
- `Mokep: Set up MCP for Claude Code`, `Mokep: Copy MCP setup command`
- `Mokep: Go to frame`, `Mokep: Lint open file`

## Development

```
npm run build       # bundle extension, MCP server, webview and test harness
npm run watch
npm run typecheck
npm test            # unit tests, browser tests and the visual diff (needs Chrome and a prior build)
npm run fixture     # regenerate fixtures/test.pen.json
```

- Visual tests render `fixtures/test.pen.json` in Chrome and compare it with pen.dev exports using a percentage threshold. Eight of the nine frames differ by less than 2%; `09-misc` by about 8%.
- UI tests drive the real interface with mouse and keyboard (modes, popup, comments, agent indicator, reduced motion, wheel). A CSP test renders the viewer under the exact policy the extension sends.

Project layout:

- `src/core`: parsing, variables, layout, instances, edit, lint, comments and recent-file logic. No DOM and no `vscode` imports.
- `src/webview`: PixiJS renderer (`render/`), the UI (`ui.ts`), its design tokens and helpers (`ui-kit.ts`) and the agent indicator (`agents.ts`).
- `src/mcp` and `src/bridge`: MCP server and the WebSocket bridge to the extension.
- `harness/`: standalone page that renders a fixture in a browser.
- `fixtures/`, `test/`, `scripts/`: test design, reference images, tests and generators.

`CLAUDE.md` holds the design rules, decisions and the list of known rendering deviations.

## Licenses

The project itself has no license yet (`UNLICENSED`). Bundled fonts (Fontsource, OFL or Apache) and icons (Lucide, Material Symbols) keep their own licenses, which are in `assets/fonts/licenses` and `assets/icons/licenses`.
