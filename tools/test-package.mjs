import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);

if (args.some(arg => arg !== "--runtime-only" && arg !== "--skip-build"))
{
	throw new Error("Usage: test-package.mjs [--runtime-only] [--skip-build]");
}
const runtimeOnly = args.includes("--runtime-only");

if (!args.includes("--skip-build"))
{
	execFileSync("pnpm", ["run", "build"], { cwd: root, stdio: "inherit" });
}

// Build-free verification is explicit, never inferred from a possibly stale dist directory.
const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));

for (const entry of Object.values(manifest.exports))
{
	for (const path of Object.values(entry.import))
	{
		assert.ok((await stat(resolve(root, path))).isFile(), `Build the package before consumer verification: ${path}`);
	}
}
const directory = await mkdtemp(join(tmpdir(), "formatter-consumer-"));
const run = (command, args, cwd = directory) => execFileSync(command, args, { cwd, stdio: "inherit" });

try
{
	// Test npm's actual release artifact without re-running prepack/prepare hooks.
	run("npm", ["pack", "--ignore-scripts", "--cache", join(directory, "npm-cache"), "--pack-destination", directory], root);
	const packed = (await readdir(directory)).find(file => file.endsWith(".tgz"));
	assert.ok(packed, "npm pack must produce a tarball");
	const archive = join(directory, packed);
	await writeFile(join(directory, "package.json"), JSON.stringify({ private: true, type: "module" }));
	// Install the real archive and its published dependencies, with no workspace links.
	run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--cache", join(directory, "npm-cache"), archive]);
	const installed = join(directory, "node_modules/@neutrium/formatter");
	assert.ok((await stat(join(installed, "UNICODE-LICENSE.txt"))).isFile());

	for (const guide of ["formatting", "parsing", "diagnostics", "codecs", "development", "bundle-size"])
	{
		assert.ok((await stat(join(installed, "guides", `${guide}.md`))).isFile(), `Packaged guide: ${guide}`);
	}

	const sizeReport = JSON.parse(await readFile(join(installed, "dist/bundle-sizes.json"), "utf8"));
	assert.equal(sizeReport.package.version, manifest.version, "Packed measurements describe this release");
	assert.ok(sizeReport.scenarios.length > 0, "Packed measurements contain usage scenarios");

	for (const file of await readdir(join(installed, "dist"), { recursive: true }))
	{
		if (!file.endsWith(".d.ts.map"))
		{
			continue;
		}

		const path = join(installed, "dist", file);
		const map = JSON.parse(await readFile(path, "utf8"));

		for (const source of map.sources)
		{
			assert.ok((await stat(resolve(dirname(path), map.sourceRoot || "", source))).isFile(), source);
		}
	}
	await cp(join(root, "tests/fixtures/consumer.mjs"), join(directory, "consumer.mjs"));
	run(process.execPath, ["consumer.mjs"]);

	if (!runtimeOnly)
	{
		for (const file of await readdir(join(root, "tests")))
		{
			if (file.endsWith(".type-test.ts"))
			{
				await cp(join(root, "tests", file), join(directory, file));
			}
		}

		// Check the public declarations themselves, including their dependencies.
		for (const moduleResolution of ["NodeNext", "Bundler"])
		{
			await writeFile(join(directory, "tsconfig.json"), JSON.stringify({
				compilerOptions: {
					strict: true, noEmit: true, skipLibCheck: false, target: "ES2020",
					module: moduleResolution === "NodeNext" ? "NodeNext" : "ESNext", moduleResolution,
				},
				include: ["*.type-test.ts"],
			}));

			for (const compiler of ["typescript-min", "typescript"])
			{
				run(process.execPath, [join(root, "node_modules", compiler, "bin/tsc"), "-p", "tsconfig.json"]);
				console.log(`Packed consumer passed: ${compiler}, ${moduleResolution}`);
			}
		}
	}
}
finally
{
	await rm(directory, { recursive: true, force: true });
}
