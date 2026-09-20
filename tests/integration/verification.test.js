import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("../../", import.meta.url);
const { scripts } = JSON.parse(await readFile(new URL("package.json", root), "utf8"));

test("aggregate verification builds once and keeps its individual checks build-free", () => {
	function steps(name) {
		if (name === "build") return [name];
		return scripts[name].split(" && ").flatMap(command => {
			const run = /^pnpm run ([\w:-]+)$/.exec(command);
			return run ? steps(run[1]) : [command];
		});
	}
	for (const name of ["verify", "test", "test:integration", "test:browser", "demo:build", "site", "prepublishOnly"]) {
		const commands = steps(name);
		assert.equal(commands[0], "build", name);
		assert.equal(commands.filter(command => command === "build").length, 1, name);
	}
	for (const name of ["verify:built", "test:built", "test:integration:built", "test:browser:built", "site:built"])
		assert.equal(steps(name).includes("build"), false, name);
	assert.equal(scripts["test:package:built"], "node tools/test-package.mjs --skip-build");
	assert.deepEqual(steps("verify"), ["build", ...steps("test:built"), ...steps("test:integration:built"), scripts["test:package:built"]]);
});

test("standalone pack builds fresh output while npm publish reuses verified output", async () => {
	const directory = await mkdtemp(join(tmpdir(), "formatter-lifecycle-"));
	try {
		await cp(new URL("tools/prepack.mjs", root), join(directory, "prepack.mjs"));
		await writeFile(join(directory, "record.mjs"), `import { appendFileSync } from 'node:fs';
appendFileSync('events.log', process.argv[2] + '\\n');`);
		await writeFile(join(directory, "package.json"), JSON.stringify({
			name: "formatter-lifecycle-fixture", version: "1.0.0", type: "module",
			files: ["record.mjs"],
			scripts: {
				build: "node record.mjs build",
				verify: "pnpm run build && node record.mjs verify",
				prepublishOnly: scripts.prepublishOnly,
				prepack: "node record.mjs prepack && node prepack.mjs",
			},
		}));
		const run = (command, args) => execFileSync(command, args, {
			cwd: directory, stdio: "pipe", env: { ...process.env,
				npm_config_cache: join(directory, "npm-cache"), npm_config_update_notifier: "false" },
		});
		for (const [command, args, expected] of [
			["pnpm", ["pack", "--out", join(directory, "pnpm-fixture.tgz")], ["prepack", "build"]],
			["npm", ["pack", "--ignore-scripts=false"], ["prepack", "build"]],
			// Only a throwaway fixture is dry-run; this never publishes a package.
			["npm", ["publish", "--dry-run", "--ignore-scripts=false"], ["build", "verify", "prepack"]],
			["npm", ["pack", "--ignore-scripts"], []],
		]) {
			await writeFile(join(directory, "events.log"), "");
			run(command, args);
			assert.deepEqual((await readFile(join(directory, "events.log"), "utf8")).trim().split("\n").filter(Boolean), expected,
				`${command} ${args.join(" ")}`);
		}
	} finally { await rm(directory, { recursive: true, force: true }); }
});
