import { execFileSync } from "node:child_process";

// npm publish runs prepublishOnly first, which builds and verifies this same output.
// Standalone packing (or running this hook directly) must still build from source.
if (process.env.npm_command !== "publish")
{
	execFileSync("pnpm", ["run", "build"], { stdio: "inherit" });
}
