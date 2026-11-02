# Mokep

Mokep is a VS Code extension that shows `.pen` design files (schema 2.21) in a read-only viewer. An AI agent such as Claude Code edits the design through Mokep's own MCP server, and you watch the result update live.

It is an independent project. It does not copy code, UI or assets from pen.dev.

## What it does

- Opens `*.pen` files in a canvas with pan and zoom. The files are plain JSON; files saved by pen.dev can be encrypted, and Mokep cannot read those.
- Renders frames, shapes, fills, strokes, gradients (including mesh), effects, blend modes, text, icons, images, flex layout, components with overrides, variables and themes.
- Never runs `script` nodes. They are shown as placeholders.
- Inspector panel, Alt-measure, pinned comments, a lint command, and Ctrl+F to find a frame by name or id.
- When an agent edits the file, moved nodes slide, new nodes fade in and changed nodes flash.
- Element animation is not part of the format and is not rendered. Agents describe it in `metadata: { "type": "animation", "description": "..." }` and the inspector shows that text.

The design-to-code bridge is not built yet.

## Agent tools (MCP)

Mokep ships an MCP server with these tools: `mokep_read`, `mokep_edit`, `mokep_lint`, `mokep_open`, `mokep_state`, `mokep_focus`, `mokep_screenshot`, `mokep_status`, `mokep_comments` and `mokep_comment`.

- Edits are written atomically and validated (ids and refs). An edit is blocked while the file has uncommitted git changes, unless the agent acknowledges it. Undo is done with git.
- Screenshots come from the open viewer, so `mokep_screenshot` only works while the file is open in VS Code.
- The extension and the MCP server talk over a local WebSocket on `127.0.0.1`, protected by a token stored in `~/.mokep/bridge.json`.
- Comments are stored next to the design as `<name>.pen.comments.json`.

## Install

Mokep is not published to a marketplace. Build the package and install it from a file:

```
npm install
npm run assets      # downloads the bundled fonts and icons
npm run package     # builds and creates mokep-0.0.1.vsix
code --install-extension mokep-0.0.1.vsix
```

On first start, Mokep asks in a notification whether to register its MCP server with Claude Code. Nothing runs until you click Install. This needs Node.js 18 or newer and the `claude` CLI on your PATH. You can also run the command palette entries `Mokep: Set up MCP for Claude Code` or `Mokep: Copy MCP setup command`.

After registering, start a new Claude Code session so the `mokep_` tools appear.

## Commands

- `Mokep: Set up MCP for Claude Code`
- `Mokep: Copy MCP setup command`
- `Mokep: Go to frame`
- `Mokep: Lint open file`

## Development

```
npm run build       # bundle extension, MCP server, webview and test harness
npm run watch
npm run typecheck
npm test            # unit tests plus visual diff against fixtures/reference
npm run fixture     # regenerate fixtures/test.pen.json
```

The visual tests render `fixtures/test.pen.json` in Chrome through Playwright and compare it with pen.dev exports using a percentage threshold. Eight of the nine frames differ by less than 2%; `09-misc` differs by about 8%.

Project layout:

- `src/core`: parsing, variables, layout, instances, edit and lint logic. No DOM and no `vscode` imports.
- `src/webview`: PixiJS renderer and the UI panels.
- `src/mcp` and `src/bridge`: MCP server and the WebSocket bridge to the extension.
- `harness/`: standalone page that renders a fixture in a browser.
- `fixtures/`, `test/`, `scripts/`: test design, reference images, tests and generators.

`CLAUDE.md` holds the design rules, decisions and the list of known rendering deviations.

## Licenses

The project itself has no license yet (`UNLICENSED`). Bundled fonts (Fontsource, OFL or Apache) and icons (Lucide, Material Symbols) keep their own licenses, which are in `assets/fonts/licenses` and `assets/icons/licenses`.
