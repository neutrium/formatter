import { execFileSync } from "node:child_process";

// Use only when module-level caches or pre-import runtime changes need a fresh process.
// Do not import the package here: callers install their instrumentation before importing it.
export function runIsolated(source) {
	try {
		return execFileSync(process.execPath, ["--input-type=module", "-e",
			`import assert from 'node:assert/strict';\n${source}`], {
			cwd: new URL("../../", import.meta.url), encoding: "utf8", stdio: "pipe", timeout: 30000,
		});
	} catch (error) {
		error.message += `\nIsolated test stdout:\n${error.stdout ?? ""}\nIsolated test stderr:\n${error.stderr ?? ""}`;
		throw error;
	}
}
