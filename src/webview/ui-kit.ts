/** Design tokens for every piece of extension UI. They never touch the rendered design frames.
 *  Colour carries meaning: blue = selection, amber = your comments, violet = the agent. */
export const CSS = `
:root{--mk-ink:#17181c;--mk-surface:#1f2126;--mk-raised:#272a31;--mk-hover:#31353d;--mk-line:#30343c;--mk-text:#e8e9ec;--mk-muted:#8b909a;
--mk-accent:#6ea8ff;--mk-user:#f5b942;--mk-agent:#a78bfa;--mk-ok:#5ad19a;--mk-r-lg:14px;--mk-r-md:9px;--mk-r-sm:6px;
--mk-font:"Segoe UI Variable Text","Segoe UI",ui-sans-serif,system-ui,sans-serif;--mk-mono:"Cascadia Code",ui-monospace,Consolas,monospace}
.mk{font:13px/1.45 var(--mk-font);color:var(--mk-text);-webkit-font-smoothing:antialiased}
.mk :focus-visible{outline:2px solid var(--mk-accent);outline-offset:2px}
.mk-card{background:var(--mk-surface);border-radius:var(--mk-r-lg);box-shadow:0 0 0 1px var(--mk-line),0 18px 40px -14px #000c}
.mk-scroll{scrollbar-width:thin;scrollbar-color:#3a3e48 transparent}
.mk-popup{position:fixed;left:16px;top:68px;width:312px;max-height:calc(100% - 148px);overflow:auto;display:none;padding:14px;box-sizing:border-box;z-index:5}
.mk-head{display:flex;gap:10px;align-items:flex-start}
.mk-glyph{flex:none;width:30px;height:30px;border-radius:var(--mk-r-md);display:grid;place-items:center;background:color-mix(in srgb,var(--mk-accent) 16%,transparent);color:var(--mk-accent)}
.mk-headtext{flex:1;min-width:0}
.mk-title{font-weight:600;font-size:14px;line-height:1.3;word-break:break-word}
.mk-sub{display:flex;gap:8px;align-items:center;margin-top:3px;color:var(--mk-muted);font-size:12px}
.mk-chip{border:0;background:var(--mk-raised);color:var(--mk-muted);font:11px var(--mk-mono);border-radius:5px;padding:1px 6px;cursor:pointer;transition:background .12s}
.mk-chip:hover{background:var(--mk-hover);color:var(--mk-text)}
.mk-iconbtn{flex:none;width:26px;height:26px;border:0;border-radius:var(--mk-r-sm);background:transparent;color:var(--mk-muted);display:grid;place-items:center;cursor:pointer;transition:background .12s,color .12s}
.mk-iconbtn:hover{background:var(--mk-raised);color:var(--mk-text)}
.mk-geo{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:14px}
.mk-cell{background:var(--mk-raised);border-radius:var(--mk-r-md);padding:6px 8px}
.mk-cell b{display:block;font-weight:600;font-size:13px;font-variant-numeric:tabular-nums}
.mk-cell span{color:var(--mk-muted);font-size:11px}
.mk-rows{margin-top:14px;display:grid;grid-template-columns:auto 1fr;gap:7px 14px;align-items:center}
.mk-k{color:var(--mk-muted)}
.mk-v{display:flex;gap:7px;align-items:center;min-width:0;word-break:break-word}
.mk-swatch{flex:none;width:14px;height:14px;border-radius:4px;box-shadow:inset 0 0 0 1px #ffffff2e}
.mk-details{margin-top:14px}
.mk-details summary{cursor:pointer;color:var(--mk-muted);width:max-content;border-radius:var(--mk-r-sm)}
.mk-details summary:hover{color:var(--mk-text)}
.mk-pre{margin:8px 0 0;padding:10px;max-height:200px;overflow:auto;white-space:pre-wrap;word-break:break-word;background:var(--mk-ink);border-radius:var(--mk-r-md);color:#c9ccd3;font:11px/1.5 var(--mk-mono)}
.mk-menu{position:fixed;min-width:180px;max-width:260px;padding:6px;display:none;z-index:13}
.mk-menuhead{padding:4px 8px 6px;color:var(--mk-muted);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mk-menuitem{display:flex;align-items:center;gap:8px;width:100%;border:0;border-radius:var(--mk-r-sm);padding:7px 8px;background:transparent;color:var(--mk-text);font:13px var(--mk-font);text-align:left;cursor:pointer;transition:background .12s}
.mk-menuitem:hover,.mk-menuitem:focus-visible{background:var(--mk-raised)}
.mk-menuitem svg{color:var(--mk-muted)}
.mk-cbtn{position:fixed;right:16px;bottom:18px;display:flex;align-items:center;gap:8px;padding:8px 14px;border:0;border-radius:999px;color:var(--mk-text);font:600 12.5px var(--mk-font);cursor:pointer;z-index:6;transition:background .12s}
.mk-cbtn:hover{background:var(--mk-raised)}
.mk-badge{min-width:18px;height:18px;border-radius:9px;padding:0 5px;background:var(--mk-user);color:var(--mk-ink);font:600 11px/18px var(--mk-font);text-align:center}
.mk-cpanel{position:fixed;right:16px;top:68px;width:320px;max-height:calc(100% - 150px);overflow:auto;display:none;padding:14px;box-sizing:border-box;z-index:5}
.mk-citem{display:flex;gap:10px;align-items:flex-start;margin-top:14px}
.mk-citem[data-done]{opacity:.5}
.mk-cmeta{margin-top:3px;color:var(--mk-muted);font-size:12px}
.mk-btn:disabled{background:var(--mk-raised);color:var(--mk-muted);cursor:default;filter:none}
.mk-modes{position:fixed;left:16px;top:12px;display:flex;gap:2px;padding:4px;z-index:10}
.mk-mode{display:flex;align-items:center;gap:6px;border:0;border-radius:var(--mk-r-md);padding:6px 10px;background:transparent;color:var(--mk-muted);font:600 12.5px var(--mk-font);cursor:pointer;transition:background .12s,color .12s}
.mk-mode:hover{color:var(--mk-text)}
.mk-mode[aria-pressed=true]{background:var(--mk-raised);color:var(--mk-text)}
.mk-mode[data-kind=comment][aria-pressed=true] svg{color:var(--mk-user)}
.mk-composer{position:fixed;width:320px;padding:12px;display:none;box-sizing:border-box;z-index:12}
.mk-textarea{display:block;width:100%;box-sizing:border-box;min-height:76px;margin-top:10px;resize:vertical;padding:8px 10px;background:var(--mk-ink);color:var(--mk-text);border:1px solid var(--mk-line);border-radius:var(--mk-r-md);font:13px/1.45 var(--mk-font);outline:none}
.mk-textarea:focus{border-color:var(--mk-accent)}
.mk-textarea::placeholder{color:var(--mk-muted)}
.mk-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:10px}
.mk-actions .mk-btn{width:auto;margin-top:0}
.mk-actions .mk-kbd{margin-right:auto}
.mk-btn2{border:0;border-radius:var(--mk-r-md);padding:8px 12px;background:var(--mk-raised);color:var(--mk-text);font:600 12.5px var(--mk-font);cursor:pointer;transition:background .12s}
.mk-btn2:hover{background:var(--mk-hover)}
.mk-emptystate{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);max-width:320px;text-align:center;color:var(--mk-muted);pointer-events:none;display:none}
.mk-emptystate b{display:block;margin-bottom:4px;color:var(--mk-text);font-size:14px;font-weight:600}
.mk-avatar{flex:none;width:20px;height:20px;border-radius:50%;background:var(--mk-user);color:var(--mk-ink);font:600 11px/20px var(--mk-font);text-align:center}
.mk-avatar[data-agent]{background:var(--mk-agent)}
.mk-ctext{flex:1;min-width:0;word-break:break-word}
.mk-link{border:0;background:transparent;color:var(--mk-accent);font:12px var(--mk-font);cursor:pointer;padding:0 2px;border-radius:4px}
.mk-link:hover{text-decoration:underline}
.mk-link:disabled{color:var(--mk-muted);cursor:default;text-decoration:none}
.mk-btn{margin-top:16px;width:100%;border:0;border-radius:var(--mk-r-md);padding:8px 12px;background:var(--mk-accent);color:var(--mk-ink);font:600 12.5px var(--mk-font);cursor:pointer;transition:filter .12s}
.mk-btn:hover{filter:brightness(1.1)}
.mk-hint{margin-top:10px;color:var(--mk-muted);font-size:12px}
.mk-search{position:fixed;top:12px;left:50%;transform:translateX(-50%);width:min(440px,calc(100% - 680px));min-width:260px;padding:6px;z-index:10;transition:box-shadow .12s}
.mk-search:focus-within{box-shadow:0 0 0 1px var(--mk-accent),0 18px 40px -14px #000c}
.mk-srow{display:flex;gap:8px;align-items:center;padding:0 6px}
.mk-srow svg{flex:none;color:var(--mk-muted)}
.mk-input{flex:1;min-width:0;border:0;outline:none;background:transparent;color:var(--mk-text);font:13.5px var(--mk-font);padding:7px 0}
.mk-input::placeholder{color:var(--mk-muted)}
.mk-kbd{flex:none;border-radius:5px;padding:2px 6px;background:var(--mk-raised);color:var(--mk-muted);font:11px var(--mk-mono)}
.mk-search:focus-within .mk-kbd{display:none}
.mk-select{border:0;border-radius:var(--mk-r-sm);padding:5px 6px;background:var(--mk-raised);color:var(--mk-text);font:12px var(--mk-font)}
.mk-field{display:flex;align-items:center;gap:6px;color:var(--mk-muted);font-size:12px}
.mk-list{display:none;margin-top:6px;padding-top:6px;max-height:300px;overflow:auto;border-top:1px solid var(--mk-line)}
.mk-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:var(--mk-r-sm);cursor:pointer}
.mk-row:hover{background:var(--mk-raised)}
.mk-row[data-on]{background:color-mix(in srgb,var(--mk-accent) 18%,transparent)}
.mk-row svg{flex:none;color:var(--mk-muted)}
.mk-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mk-meta{flex:none;color:var(--mk-muted);font-size:12px;font-variant-numeric:tabular-nums}
.mk-empty{padding:6px 8px;color:var(--mk-muted)}
.mk-bubble{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);display:none;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;pointer-events:none;z-index:6}
.mk-dot{width:8px;height:8px;border-radius:50%;background:var(--mk-ok)}
.mk-bubble[data-state=working] .mk-dot{background:var(--mk-accent);animation:mk-pulse 1.4s ease-in-out infinite}
@keyframes mk-pulse{50%{opacity:.3;transform:scale(.8)}}
.mk-agents{position:fixed;top:12px;right:16px;display:flex;flex-direction:column;gap:8px;align-items:flex-end;pointer-events:none;z-index:6}
.mk-agent{display:flex;align-items:center;gap:10px;padding:7px 14px 7px 12px;border-radius:999px}
.mk-pulse{position:relative;flex:none;width:10px;height:10px;margin:4px}
.mk-halo,.mk-core{position:absolute;inset:0;border-radius:50%;background:var(--mk-agent)}
.mk-halo{opacity:0;transform:scale(0)}
.mk-aname{font-weight:600}
.mk-aact{color:var(--mk-muted)}
.mk-agent[data-phase=in]{animation:mk-agent-in .7s cubic-bezier(.2,.8,.2,1) both}
.mk-agent[data-phase=in] .mk-halo{animation:mk-breath-in 1s cubic-bezier(.2,.8,.2,1) both}
.mk-agent[data-phase=loop] .mk-halo{opacity:.35;transform:scale(2);animation:mk-breath 3.2s ease-in-out infinite}
.mk-agent[data-phase=out]{animation:mk-agent-out .9s ease-in both}
.mk-agent[data-phase=out] .mk-halo{animation:mk-breath-out .9s ease-in both}
@keyframes mk-agent-in{from{opacity:0;transform:translateY(-6px) scale(.94)}to{opacity:1;transform:none}}
@keyframes mk-breath-in{from{opacity:0;transform:scale(0)}to{opacity:.35;transform:scale(2)}}
@keyframes mk-breath{0%,100%{opacity:.35;transform:scale(2)}50%{opacity:.12;transform:scale(1.15)}}
@keyframes mk-breath-out{from{opacity:var(--o0,.35);transform:scale(var(--s0,2))}to{opacity:0;transform:scale(0)}}
@keyframes mk-agent-out{0%,35%{opacity:1;transform:none}100%{opacity:0;transform:translateY(-4px) scale(.96)}}
@media (prefers-reduced-motion:reduce){.mk-dot,.mk-agent,.mk-agent *{animation:none!important}.mk *{transition:none!important}.mk-agent[data-phase=loop] .mk-halo{transform:scale(1.6)}}
`;

export const ICONS: Record<string, string> = {
  frame: '<path d="M5.5 2.5v11M10.5 2.5v11M2.5 5.5h11M2.5 10.5h11"/>',
  rectangle: '<rect x="2.5" y="3.5" width="11" height="9" rx="1.5"/>',
  ellipse: '<circle cx="8" cy="8" r="5.5"/>',
  text: '<path d="M3.5 4.5h9M8 4.5v8"/>',
  ref: '<path d="M8 2.5l5.5 5.5L8 13.5 2.5 8z"/>',
  polygon: '<path d="M8 2.5l5.5 4-2 6.5h-7l-2-6.5z"/>',
  path: '<path d="M3 12c2-8 8-8 10 0"/>',
  search: '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/>',
  close: '<path d="M4 4l8 8M12 4l-8 8"/>',
  comment: '<path d="M3 3.5h10v7H8.5L5.5 13v-2.5H3z"/>',
  cursor: '<path d="M3.5 2.5l9 4-3.8 1.4L7.3 12z"/>',
  copy: '<rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-1A1.5 1.5 0 0 0 9 3H4.5A1.5 1.5 0 0 0 3 4.5V9a1.5 1.5 0 0 0 1.5 1.5h1"/>',
  dot: '<circle cx="8" cy="8" r="2"/>',
};
/** Static, trusted markup only. */
export const icon = (name: string, size = 16) => {
  const s = document.createElement("span");
  s.style.cssText = "display:inline-grid;place-items:center;flex:none";
  const svg = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ICONS.dot}</svg>`, "image/svg+xml");
  s.append(document.importNode(svg.documentElement, true));
  return s;
};

export const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, ...kids: (Node | string)[]) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const k of kids) e.append(k);
  return e;
};
export const abs = (style: string) => { const e = document.createElement("div"); e.setAttribute("style", style); return e; };
export const reduceMotion = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
