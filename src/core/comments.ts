export interface Comment { id: string; nodeId: string; text: string; author: "user" | "agent"; createdAt: string; resolved: boolean; }
export interface CommentsFile { version: 1; comments: Comment[]; }

export const commentsPath = (penFile: string) => penFile + ".comments.json";

export function parseComments(text: string | undefined): CommentsFile {
  if (!text) return { version: 1, comments: [] };
  try {
    const j = JSON.parse(text);
    const list = Array.isArray(j?.comments) ? j.comments : [];
    return { version: 1, comments: list.filter((c: any) => c && typeof c.id === "string" && typeof c.nodeId === "string" && typeof c.text === "string").map((c: any) => ({ author: "user", createdAt: "", resolved: false, ...c })) };
  } catch { return { version: 1, comments: [] }; }
}

export function addComment(f: CommentsFile, nodeId: string, text: string, author: Comment["author"], now = new Date()): CommentsFile {
  const id = "c" + now.getTime().toString(36) + Math.floor(Math.random() * 1296).toString(36);
  return { version: 1, comments: [...f.comments, { id, nodeId, text, author, createdAt: now.toISOString(), resolved: false }] };
}

export function removeComment(f: CommentsFile, id: string): CommentsFile | null {
  if (!f.comments.some((c) => c.id === id)) return null;
  return { version: 1, comments: f.comments.filter((c) => c.id !== id) };
}

export function setResolved(f: CommentsFile, id: string, resolved = true): CommentsFile | null {
  if (!f.comments.some((c) => c.id === id)) return null;
  return { version: 1, comments: f.comments.map((c) => (c.id === id ? { ...c, resolved } : c)) };
}
