export interface SetupStep { cmd: string; args: string[]; ignoreFailure?: boolean; }

const SAFE_PATH = /^[\w .:\/()@+-]+$/;

/** Commands that register the Mokep MCP server with Claude Code (user scope). Null when the path is unsafe to pass through a shell. */
export function buildSetupSteps(serverJs: string): SetupStep[] | null {
  if (!SAFE_PATH.test(serverJs)) return null;
  const quoted = `"${serverJs}"`;
  return [
    { cmd: "claude", args: ["mcp", "remove", "mokep", "--scope", "user"], ignoreFailure: true },
    { cmd: "claude", args: ["mcp", "add", "--scope", "user", "mokep", "--", "node", quoted] },
  ];
}
