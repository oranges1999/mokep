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
- MCP <-> webview: local WebSocket, 127.0.0.1 only, with token.
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
- Setup: `npm i`, `npm run assets` (fonts+icons), `npm run fixture`, `npm run build`, `npm run package`, then `code --install-extension mokep-0.0.1.vsix` and run the "Mokep: Copy MCP setup command" command.

## Known deviations and shortcuts
- Text content bound to a string variable ("$app.title") is resolved here; pen.dev shows the literal text.
- Text: `justify` aligns to the widest line, not the box width. Underline/strikethrough positions are approximate.
- Mesh gradient ignores moved interior points (regular grid only). Angular gradient uses bbox-normalised angles.
- evenodd paths: first subpath filled, the rest cut out (fine for simple holes).
- Group inside a flex parent has no intrinsic size. Frame with layout none + fit_content is not sized from children.
- Outer shadow of a frame with `clip: true` is clipped by the frame.
- Icon `weight` is ignored (weight 400 icons). `feather` library maps to lucide.
- Image crop supports axis-aligned transforms only.
- Pending: design-to-code bridge (output format not chosen).
- Element animation is not part of the .pen format and is never rendered. Agents describe it in `metadata: { type: "animation", description }`; the inspector shows that text.
- Agent edits animate in the viewer (moved nodes slide, new nodes fade in, changed nodes flash). Deleted nodes just disappear. Reduced-motion users get the flash only.
- Ctrl+F in the canvas finds frames by name or id.
- First run asks (notification) to register the MCP server with Claude Code via `claude mcp add --scope user mokep`. It never runs without a click and needs Node and the `claude` CLI on PATH.
- .pen files saved by pen.dev may be encrypted; this viewer only reads JSON.
