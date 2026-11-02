import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { applyOps, Op } from "../core/edit";
import { lint } from "../core/lint";
import { PenNode } from "../core/schema";
import { addComment, commentsPath, parseComments, setResolved } from "../core/comments";
import { existsSync } from "node:fs";
import { callBridge } from "./client";
import { assertPen, gitDirty, readDoc, writeAtomic } from "./files";

const server = new McpServer({ name: "mokep", version: "0.0.1" });

// Tell the viewer which agent is acting, on every tool call. The agent name comes from the MCP client handshake.
// shortcut: fire-and-forget over one socket per call and a wrapper typed loosely, upgrade if tool volume grows.
const touch = (tool: string, file?: unknown) => {
  void callBridge({ type: "activity", agent: server.server.getClientVersion()?.name ?? "agent", tool, file: typeof file === "string" ? resolve(file) : undefined }, 3000).catch(() => undefined);
};
const register = server.registerTool.bind(server) as (...a: any[]) => unknown;
(server as any).registerTool = (name: string, cfg: unknown, cb: (...a: any[]) => unknown) =>
  register(name, cfg, (...args: any[]) => { touch(name.replace(/^mokep_/, ""), args[0]?.file); return cb(...args); });
const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const fail = (t: string) => ({ ...text(t), isError: true as const });

function elide(n: PenNode, depth: number): unknown {
  if (!n.children) return n;
  if (depth <= 0) return { ...n, children: "..." };
  return { ...n, children: n.children.map((c) => elide(c, depth - 1)) };
}
function find(list: PenNode[], id: string): PenNode | undefined {
  for (const n of list) { if (n.id === id) return n; const s = n.children && find(n.children, id); if (s) return s; }
  return undefined;
}

server.registerTool("mokep_read", {
  description: "Read a .pen file (JSON, schema 2.21). With id, returns that node; depth limits nested children (deeper ones show \"...\").",
  inputSchema: { file: z.string(), id: z.string().optional(), depth: z.number().int().min(0).max(20).optional() },
}, async ({ file, id, depth }) => {
  try {
    const doc = readDoc(file);
    if (!id) return text(JSON.stringify({ version: doc.version, themes: doc.themes, variables: doc.variables, children: doc.children.map((c) => elide(c, depth ?? 1)) }, null, 1));
    const n = find(doc.children, id);
    return n ? text(JSON.stringify(elide(n, depth ?? 2), null, 1)) : fail(`node "${id}" not found`);
  } catch (e) { return fail((e as Error).message); }
});

const opSchema = z.union([
  z.object({ op: z.literal("insert"), parent: z.string(), node: z.record(z.string(), z.any()), index: z.number().int().optional() }),
  z.object({ op: z.literal("update"), id: z.string(), props: z.record(z.string(), z.any()) }),
  z.object({ op: z.literal("replace"), id: z.string(), node: z.record(z.string(), z.any()) }),
  z.object({ op: z.literal("delete"), id: z.string() }),
  z.object({ op: z.literal("move"), id: z.string(), parent: z.string(), index: z.number().int().optional() }),
  z.object({ op: z.literal("setVariables"), variables: z.record(z.string(), z.any()), replace: z.boolean().optional() }),
]);

server.registerTool("mokep_edit", {
  description: "Apply edit operations to a .pen file atomically. Use parent \"document\" for top-level nodes. Ids may be omitted on insert. For instances use path ids like \"instanceId/childId\" in update/replace. All-or-nothing: any validation error leaves the file untouched. Undo is git only, so commit first.",
  inputSchema: { file: z.string(), ops: z.array(opSchema).min(1), acknowledgeUncommitted: z.boolean().optional() },
}, async ({ file, ops, acknowledgeUncommitted }) => {
  try {
    if (gitDirty(file) && !acknowledgeUncommitted) {
      return fail("This file has uncommitted changes and undo relies on git. Ask the user to commit, or call again with acknowledgeUncommitted: true.");
    }
    const doc = readDoc(file);
    const r = applyOps(doc, ops as Op[]);
    if (r.errors.length) return fail("No changes written.\n" + r.errors.map((e) => "- " + e).join("\n"));
    writeAtomic(file, JSON.stringify(r.doc, null, 1));
    return text([`Applied ${ops.length} operation(s).`, r.created.length ? `Created ids: ${r.created.join(", ")}` : "", ...r.warnings.map((w) => "warning: " + w)].filter(Boolean).join("\n"));
  } catch (e) { return fail((e as Error).message); }
});

server.registerTool("mokep_lint", {
  description: "Static checks on a .pen file: parse problems, duplicate ids, dangling refs, invisible text, misplaced fill_container.",
  inputSchema: { file: z.string() },
}, async ({ file }) => {
  try {
    assertPen(file);
    const issues = lint(readFileSync(resolve(file), "utf8"));
    return text(issues.length ? issues.map((i) => `${i.level}${i.node ? ` [${i.node}]` : ""}: ${i.message}`).join("\n") : "No issues.");
  } catch (e) { return fail((e as Error).message); }
});

server.registerTool("mokep_open", { description: "Open a .pen file in Mokep.", inputSchema: { file: z.string() } }, async ({ file }) => {
  try { await callBridge({ type: "open", file: resolve(file) }); return text("Opened."); } catch (e) { return fail((e as Error).message); }
});

server.registerTool("mokep_state", { description: "Which .pen files are open in the viewer, which is active, frames and render warnings.", inputSchema: {} }, async () => {
  try { const r = await callBridge({ type: "state" }); return text(JSON.stringify(r, null, 1)); } catch (e) { return fail((e as Error).message); }
});

server.registerTool("mokep_focus", {
  description: "Pan and zoom the viewer to a node so the user sees it.",
  inputSchema: { nodeId: z.string(), file: z.string().optional() },
}, async ({ nodeId, file }) => {
  try { await callBridge({ type: "focus", nodeId, file: file && resolve(file) }); return text("Focused."); } catch (e) { return fail((e as Error).message); }
});

server.registerTool("mokep_screenshot", {
  description: "Render a node (or the whole document when nodeId is omitted) to PNG from the open viewer. Only works while the viewer has the file open.",
  inputSchema: { nodeId: z.string().optional(), file: z.string().optional(), scale: z.number().min(0.1).max(4).optional() },
}, async ({ nodeId, file, scale }) => {
  try {
    const r = await callBridge({ type: "screenshot", nodeId, file: file && resolve(file), scale }, 40000);
    return { content: [{ type: "image" as const, data: String(r.png), mimeType: "image/png" }] };
  } catch (e) { return fail((e as Error).message); }
});

const readComments = (file: string) => parseComments(existsSync(commentsPath(resolve(file))) ? readFileSync(commentsPath(resolve(file)), "utf8") : undefined);

server.registerTool("mokep_comments", {
  description: "List the comments the user pinned on nodes (stored next to the file as <name>.pen.comments.json). Open comments are requests for you to act on.",
  inputSchema: { file: z.string(), includeResolved: z.boolean().optional() },
}, async ({ file, includeResolved }) => {
  try {
    const list = readComments(file).comments.filter((c) => includeResolved || !c.resolved);
    return text(list.length ? JSON.stringify(list, null, 1) : "No open comments.");
  } catch (e) { return fail((e as Error).message); }
});

server.registerTool("mokep_comment", {
  description: "Reply with a comment on a node (action add), or mark a comment resolved or reopened (action resolve or reopen).",
  inputSchema: { file: z.string(), action: z.enum(["add", "resolve", "reopen"]), nodeId: z.string().optional(), text: z.string().optional(), id: z.string().optional() },
}, async ({ file, action, nodeId, text: body, id }) => {
  try {
    const cur = readComments(file);
    let next;
    if (action === "add") {
      if (!nodeId || !body) return fail("add needs nodeId and text");
      if (!find(readDoc(file).children, nodeId)) return fail(`node "${nodeId}" not found`);
      next = addComment(cur, nodeId, body, "agent");
    } else {
      if (!id) return fail(`${action} needs the comment id`);
      next = setResolved(cur, id, action === "resolve");
      if (!next) return fail(`comment "${id}" not found`);
    }
    writeAtomic(commentsPath(resolve(file)), JSON.stringify(next, null, 1));
    return text("Done.");
  } catch (e) { return fail((e as Error).message); }
});

server.registerTool("mokep_status", {
  description: "Show a status bubble in the viewer so the user sees what you are doing. state working stays until cleared, idle auto-hides. Empty text clears it.",
  inputSchema: { text: z.string(), state: z.enum(["working", "idle"]).optional() },
}, async ({ text: t, state }) => {
  try { await callBridge({ type: "status", text: t, state: state ?? "idle" }); return text("ok"); } catch (e) { return fail((e as Error).message); }
});

void server.connect(new StdioServerTransport());
