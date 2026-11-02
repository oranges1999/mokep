import { describe, expect, it } from "vitest";
import { buildSetupSteps } from "../src/setupSteps";

describe("buildSetupSteps", () => {
  it("removes any old registration, then adds with the quoted server path", () => {
    const s = buildSetupSteps("C:\Users\a b\.vscode\extensions\mokep-0.0.1\dist\mcp-server.js")!;
    expect(s[0]).toMatchObject({ args: ["mcp", "remove", "mokep", "--scope", "user"], ignoreFailure: true });
    expect(s[1].args).toEqual(["mcp", "add", "--scope", "user", "mokep", "--", "node", '"C:\Users\a b\.vscode\extensions\mokep-0.0.1\dist\mcp-server.js"']);
  });
  it("refuses paths that could inject shell syntax", () => {
    for (const p of ['/x/"; rm -rf ~; "/s.js', "/x/a&b/s.js", "/x/$(id)/s.js", "/x/a|b/s.js", "/x/a%PATH%/s.js", "/x/a`b/s.js"]) expect(buildSetupSteps(p)).toBeNull();
  });
});
