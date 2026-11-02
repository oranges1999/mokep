import { describe, expect, it } from "vitest";
import { addComment, parseComments, removeComment, setResolved, commentsPath } from "../src/core/comments";

describe("comments", () => {
  it("round-trips, resolves, and ignores garbage", () => {
    expect(commentsPath("/a/b.pen")).toBe("/a/b.pen.comments.json");
    expect(parseComments("not json").comments).toEqual([]);
    expect(parseComments(undefined).comments).toEqual([]);
    const f = addComment(parseComments(undefined), "n1", "Make this bigger", "user", new Date("2026-11-02T00:00:00Z"));
    expect(f.comments[0]).toMatchObject({ nodeId: "n1", text: "Make this bigger", author: "user", resolved: false });
    const again = parseComments(JSON.stringify(f));
    expect(again.comments).toHaveLength(1);
    const done = setResolved(again, again.comments[0].id)!;
    expect(done.comments[0].resolved).toBe(true);
    expect(setResolved(again, "missing")).toBeNull();
    expect(parseComments(JSON.stringify({ comments: [{ id: 1 }, { id: "x", nodeId: "n", text: "t" }] })).comments).toHaveLength(1);
  });
  it("deletes one comment and leaves the others", () => {
    let f = addComment(parseComments(undefined), "n1", "first", "user");
    f = addComment(f, "n2", "second", "agent");
    const gone = removeComment(f, f.comments[0].id)!;
    expect(gone.comments.map((c) => c.text)).toEqual(["second"]);
    expect(removeComment(f, "missing")).toBeNull();
  });
});
