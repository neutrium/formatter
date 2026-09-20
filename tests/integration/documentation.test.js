import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

test("self-contained TypeScript JSDoc examples compile against the public API", () => {
	const root = fileURLToPath(new URL("../../", import.meta.url));
	const examples = new Map();
	for (const file of readdirSync(resolve(root, "src"), { recursive: true })) {
		if (!file.endsWith(".ts")) continue;
		const source = readFileSync(resolve(root, "src", file), "utf8");
		let index = 0;
		for (const comment of source.matchAll(/\/\*\*[\s\S]*?\*\//g)) {
			const body = comment[0].replace(/^\s*\* ?/gm, "");
			for (const block of body.matchAll(/```ts\s*\n([\s\S]*?)```/g)) {
				assert.match(block[1], /^import\s/m,
					`${file}: API examples must include imports so they can be copied and checked independently`);
				const name = resolve(root, "tests", `jsdoc-${file.replaceAll(/[/\\]/g, "-")}-${index++}.ts`);
				examples.set(name, block[1]);
			}
		}
	}
	assert.ok(examples.size > 10, "Discover examples from source rather than maintaining copies");
	const options = { strict: true, noEmit: true, target: ts.ScriptTarget.ES2020,
		module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext };
	const host = ts.createCompilerHost(options);
	const getSourceFile = host.getSourceFile.bind(host);
	host.getSourceFile = (name, languageVersion, ...args) => examples.has(name)
		? ts.createSourceFile(name, examples.get(name), languageVersion, true)
		: getSourceFile(name, languageVersion, ...args);
	const program = ts.createProgram([...examples.keys()], options, host);
	const diagnostics = ts.getPreEmitDiagnostics(program);
	assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
		getCurrentDirectory: () => root, getCanonicalFileName: name => name, getNewLine: () => "\n",
	}));
});

test("README and guide links point to existing files and headings", () => {
	const root = fileURLToPath(new URL("../../", import.meta.url));
	const files = ["README.md", ...readdirSync(resolve(root, "guides")).filter(file => file.endsWith(".md")).map(file => `guides/${file}`)];
	for (const file of files) {
		const source = readFileSync(resolve(root, file), "utf8");
		for (const match of source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
			const link = match[1];
			if (/^[a-z]+:/i.test(link)) continue;
			const [path, fragment] = link.split("#");
			const target = path ? resolve(root, dirname(file), path) : resolve(root, file);
			assert.ok(existsSync(target), `${file}: ${link}`);
			if (!fragment) continue;
			const contents = readFileSync(target, "utf8");
			const anchors = [...contents.matchAll(/^#{1,6} (.+)$/gm)].map(heading =>
				heading[1].toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s/g, "-"));
			assert.ok(anchors.includes(fragment), `${file}: missing heading ${link}`);
		}
	}
});
