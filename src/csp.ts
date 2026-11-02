/** Content Security Policy of the viewer webview. `source` is the webview's resource origin, `script` the script source
 *  (a nonce in VS Code, 'self' in the test harness). There is no 'unsafe-eval': Pixi runs through pixi.js/unsafe-eval and
 *  Yoga's WebAssembly only needs 'wasm-unsafe-eval' and a fetch of its embedded data: URL. */
export const webviewCsp = (source: string, script: string) =>
  `default-src 'none'; img-src ${source} data: blob:; font-src ${source}; style-src 'unsafe-inline'; script-src ${script} 'wasm-unsafe-eval'; connect-src ${source} data:;`;
