# mokep

VS Code extension: read-only viewer for `.pen` files (schema 2.21, https://docs.pen.dev/for-developers/the-pen-format). An agent (Claude) edits designs over MCP; the human only views.

## Rules
- NEVER run `script` nodes from a .pen file. Show a placeholder frame. Skip shader, script, browser in M1.
- Do not copy code, UI or assets from pen.dev.
- Format may change: read `version`, parser ignores unknown properties, schema snapshot lives in `fixtures/schema-2.21.md`.
- Text will never match pen.dev 100%: image tests use a % diff threshold.
- Nested components and `descendants` overrides (paths "a/b", node replacement, slots) are the hardest part: test them hard.
- Renderer (`src/webview/render`) must not touch DOM outside the display layer.

## Decisions
- Renderer: PixiJS v8 (WebGL). Blur/background blur/blend use Pixi filters; mesh gradient uses a custom shader.
- Text: canvas -> texture, redrawn per zoom level.
- Layout: yoga-layout. fit_content / fill_container map to Yoga auto / flex.
- Panels: plain TypeScript.
- MCP server is this tool's own. Atomic file writes (temp file then rename), validate id/ref after each edit, remind to commit if the file has uncommitted changes.
- MCP <-> webview: local WebSocket, 127.0.0.1 only, with token. One bridge file per VS Code window in `~/.mokep/bridges/<pid>.json`; the MCP client picks the window that has the file open, else the most recently focused one (`BridgeServer.touch` on window focus). Dead windows are cleaned up by pid check.
- Agent screenshots come from the webview (only works while the tool is open).
- Comments: `<name>.pen.comments.json`. Undo: git only.
- Tests: Playwright + pixelmatch against pen.dev screenshots, by % diff.
- Fonts: bundled via Fontsource at build time (list in config), subset vietnamese, license check OFL/Apache.
- Icons offline: lucide (ISC), phosphor (MIT), Material Symbols (Apache 2.0).

## Layout
- `src/core`     pure logic (parse, variables, layout, boxes). No DOM, no vscode.
- `src/webview`  Pixi renderer + UI.
- `src/extension.ts` custom readonly editor.
- `harness/`     standalone page to render a fixture in Chrome (for screenshots and tests).
- `fixtures/`    test .pen JSON + reference images.

## Milestones
M1 parse + shapes/fills/strokes + pan/zoom. M2 layout (Yoga) + text + fonts. M3 effects, blend, transform, mesh gradient. M4 components, refs, variables, themes, icons, images. M5 MCP server + WebSocket bridge + screenshots. M6 UI features (search, comments, inspector, measure, lint) + image-diff tests + vsix.

## Status (M1-M6 first pass done)
- Visual diff vs pen.dev exports (`fixtures/reference`, `npm test`): all 9 frames < 2% except 09-misc (~8%: missing test image, note/prompt look).
- MCP tools (prefix mokep_): mokep_read, mokep_edit (atomic, validated, blocks on uncommitted git changes unless acknowledged), mokep_lint, mokep_open, mokep_state, mokep_focus, mokep_screenshot, mokep_status, mokep_comments, mokep_comment.
- Setup: `npm i`, `npm run assets` (fonts+icons), `npm run fixture`, `npm run build`, `npm run package` (minified), then `code --install-extension mokep-<version>.vsix`. MCP is registered at `~/.mokep/mcp-server.js`, a copy the extension refreshes on every start, so updates never break the registration.

## Known deviations and shortcuts
- Text content bound to a string variable ("$app.title") is resolved here; pen.dev shows the literal text.
- Text: `justify` aligns to the widest line, not the box width. Underline/strikethrough positions are approximate.
- Mesh gradient ignores moved interior points (regular grid only). Angular gradient uses bbox-normalised angles.
- evenodd paths: first subpath filled, the rest cut out (fine for simple holes).
- Group inside a flex parent has no intrinsic size. Frame with layout none + fit_content is not sized from children.
- Outer shadow of a frame with `clip: true` is clipped by the frame.
- Icon `weight` is ignored (weight 400 icons). `feather` library maps to lucide.
- Image crop supports axis-aligned transforms only.
- Out of scope, by decision: a design-to-code or code-to-design bridge, and any animation inside a design. There is no project license (private).
- Designs are always rendered as still pictures. The extension's own animations (popup, agent edits, indicator) stay.
- Agent edits animate in the viewer (moved nodes slide, new nodes fade in, changed nodes flash). Deleted nodes just disappear. Reduced-motion users get the flash only.
- Ctrl+F in the canvas finds frames by name or id.
- First run asks (notification) to register the MCP server with Claude Code via `claude mcp add --scope user mokep`. It never runs without a click and needs Node and the `claude` CLI on PATH.
- .pen files saved by pen.dev may be encrypted; this viewer only reads JSON.
- Mouse wheel: plain scrolls vertically, Shift scrolls horizontally, Ctrl/Cmd (or trackpad pinch) zooms. Line-based wheels (deltaMode 1) are not scaled.
- UI design system: tokens live in the CSS string at the top of `src/webview/ui-kit.ts` (dark surfaces, Segoe UI, one radius scale). Colour carries meaning: blue = selection, amber = your comments, violet = the agent. It applies to every extension element and never to the rendered design frames.
- Canvas is dark (#1e1e1e) around the frames. The webview page sets body padding 0 because VS Code adds 20px side padding, which shifted the canvas away from the selection overlay.
- Layout: mode switch top left (View = inspect nodes, Comment = leave comments; keys V and C, Esc leaves comment mode), search bar top centre (Ctrl+F focuses it, holds the theme select), info popup floats on the left in View mode and shows only the clicked node (slides in only when it opens; switching node swaps the content with no animation), status bubble bottom centre, agent indicator top right. Comment mode: click a node to type a comment in an inline composer (Ctrl+Enter posts, Esc cancels), the comments panel opens on the right (launcher bottom right), pins show on the canvas, the Comment button shows the open count. Comments are only written by the extension host from the posted text; there is no VS Code input box any more.
- Agent indicator: the MCP server sends an `activity` bridge request on every tool call, with the agent name from the MCP client handshake. The viewer breathes in on the first call, breathes while calls keep coming, and breathes out after 5 s of quiet or when `mokep_status` clears the text. Reduced motion gets a static dot.
- Sidebar: an activity bar icon (media/mokep.svg) opens the "Recent designs" view (`src/recent.ts`, last 20 files, stored in globalState, filled whenever the custom editor opens a file, so MCP opens count too). View title buttons: New design file (save dialog, writes `{ version: "2.21", children: [] }`, then opens it) and Open design file. Missing files offer removal from the list. An empty design shows an empty-state message and the camera frames the first frame that arrives.
- Webview CSP (`src/csp.ts`, shared with `test/csp.test.ts`) has no `unsafe-eval`: Pixi uses `pixi.js/unsafe-eval`, Yoga needs `wasm-unsafe-eval` and `connect-src data:` for its embedded wasm.
- MCP tools refuse any path that is not `.pen` or `.pen.json` (`assertPen`). Comments can be added, resolved, reopened and deleted from the viewer; the agent can add, resolve and reopen but not delete. There is no edit-comment yet.
- UI code layout: `ui.ts` (behaviour), `ui-kit.ts` (CSS tokens, icons, DOM helpers), `agents.ts` (agent presence). Tests: `test/ui.test.ts` (real mouse and keyboard), `test/csp.test.ts`, `test/bridge-windows.test.ts`.
- Right-click menu: only the right button opens it (contextmenu event, the native menu is suppressed on the canvas). A left click just selects (View) or starts a comment (Comment). The menu has Comment and Copy id; Comment switches to comment mode and opens the composer on that node. It closes on Escape, on any canvas press, on wheel and on mode change. Whether VS Code lets the webview suppress its own context menu is not verified.
- Pins (comment mode) are pushed out of every floating box (`chromeRects` and `clearOf` in ui.ts: toolbar, search, indicator, panels, popup, composer, menu) and get a line plus an anchor dot when moved off their node.
