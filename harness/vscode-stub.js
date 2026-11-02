// Stands in for the VS Code webview API so dist/webview.js can run in a plain browser (see webview.html and test/webview.test.ts).
window.__out = [];
window.acquireVsCodeApi = () => ({ postMessage: (m) => window.__out.push(m) });
