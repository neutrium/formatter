import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

const root = new URL("../", import.meta.url);
// Use the same locked bundler as Vite and the existing bundle-boundary tests.
const require = createRequire(import.meta.resolve("vite"));
const { rolldown, VERSION } = await import(require.resolve("rolldown"));
const begin = "<!-- bundle-sizes:start -->";
const end = "<!-- bundle-sizes:end -->";

const format = `import { formatter } from "@neutrium/formatter";
export const format = (value, spec) => formatter.format(value, spec);`;
const parse = `import { parser } from "@neutrium/formatter/parse";
export const parse = (text, spec) => parser.parse(text, spec);`;

function selective(kind, parsing = false) {
	const registry = parsing ? "Parser" : "Formatter";
	const codec = kind + (parsing ? "Parser" : "Codec");
	const operation = parsing ? "parse" : "format";
	return `import { ${registry}, ${codec} } from "@neutrium/formatter/extensions${parsing ? "/parse" : ""}";
const instance = new ${registry}({ codecs: [${codec}] });
export const ${operation} = (value, spec) => instance.${operation}(value, spec);`;
}

// Exported wrappers keep inputs dynamic, preventing constant folding of sample results.
export const scenarios = [
	{ id: "default-format", label: "Default formatter (all built-ins)", source: format },
	{ id: "default-parse", label: "Default parser (all built-ins)", source: parse },
	{ id: "default-both", label: "Default formatting + parsing", source: `${format}\n${parse}` },
	...(["number", "currency", "unit", "bytes", "percentage", "ordinal", "duration"].map(kind => ({
		id: `${kind}-format`, label: `Only ${kind} formatting`, source: selective(kind),
	}))),
	{ id: "number-parse", label: "Only number parsing", source: selective("number", true) },
	{ id: "bytes-parse", label: "Only bytes parsing", source: selective("bytes", true) },
	{ id: "duration-parse", label: "Only elapsed-duration parsing", source: selective("duration", true) },
];

export const decimalEntries = {
	full: "@neutrium/decimal",
	core: "@neutrium/decimal/core",
	arithmetic: "@neutrium/decimal/arithmetic",
	scientific: "@neutrium/decimal/scientific",
};

export function decimalSource(entry) {
	return `export { Decimal } from ${JSON.stringify(entry)};`;
}

export async function bundleSource(source) {
	const id = fileURLToPath(new URL("bundle-size-consumer.js", root));
	const bundle = await rolldown({
		input: id,
		cwd: fileURLToPath(root),
		platform: "browser",
		treeshake: true,
		transform: { target: "es2020" },
		onwarn(warning) { throw new Error(`Bundle measurement failed: ${warning.message}`); },
		plugins: [{
			name: "bundle-size-consumer",
			resolveId(path) { if (path === id) return id; },
			load(path) { if (path === id) return source; },
		}],
	});

	try
	{
		const { output } = await bundle.generate({ format: "esm", minify: true, sourcemap: false });
		assert.equal(output.length, 1, "Size fixtures must produce a single JavaScript chunk");
		const chunk = output[0];
		assert.equal(chunk.type, "chunk");
		assert.deepEqual(chunk.imports, [], "Measurements must include dependencies, not externalize them");
		assert.deepEqual(chunk.dynamicImports, [], "Measurements must include every chunk");
		return { code: chunk.code, modules: Object.keys(chunk.modules) };
	}
	finally
	{
		await bundle.close();
	}
}

export function measureCode(code)
{
	return { minified: Buffer.byteLength(code, "utf8"), gzip: gzipSync(code, { level: 9 }).byteLength };
}

export function incrementalSize(combined, baseline)
{
	// Compress whole bundles first: gzip is not additive, and deltas can be negative.
	return { minified: combined.minified - baseline.minified, gzip: combined.gzip - baseline.gzip };
}

export async function measureSizes()
{
	const manifest = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
	const decimalManifest = JSON.parse(await readFile(new URL("../package.json", import.meta.resolve("@neutrium/decimal")), "utf8"));
	const report = {
		schemaVersion: 1,
		package: { name: manifest.name, version: manifest.version },
		decimalVersion: decimalManifest.version,
		bundler: { name: "rolldown", version: VERSION },
		runtime: { node: process.versions.node, zlib: process.versions.zlib },
		options: { platform: "browser", target: "es2020", format: "esm", minify: true, gzipLevel: 9 },
		baselines: {},
		scenarios: [],
	};

	for (const [name, entry] of Object.entries(decimalEntries))
	{
		const source = decimalSource(entry);
		report.baselines[name] = { entry, source, ...measureCode((await bundleSource(source)).code) };
	}

	for (const scenario of scenarios)
	{
		const measured = { ...scenario, standalone: measureCode((await bundleSource(scenario.source)).code), withDecimal: {} };

		for (const [name, baseline] of Object.entries(report.baselines))
		{
			const total = measureCode((await bundleSource(`${baseline.source}\n${scenario.source}`)).code);
			measured.withDecimal[name] = { total, added: incrementalSize(total, baseline) };
		}

		report.scenarios.push(measured);
	}

	return report;
}

const kib = bytes => `${(bytes / 1024).toFixed(2)} KiB`;

export function renderSizes(report)
{
	const lines = [
		`Measured for **${report.package.name} ${report.package.version}**, with **@neutrium/decimal ${report.decimalVersion}** and **Rolldown ${report.bundler.version}**. Sizes are KiB (1 KiB = 1,024 bytes).`,
		"",
		"| Functionality included | Minified, including Decimal | Gzipped, including Decimal | Added minified, Decimal already bundled | Added gzipped, Decimal already bundled |",
		"| --- | ---: | ---: | ---: | ---: |",
	];

	for (const item of report.scenarios)
	{
		const added = item.withDecimal.full.added;
		lines.push(`| ${item.label} | ${kib(item.standalone.minified)} | ${kib(item.standalone.gzip)} | ${kib(added.minified)} | ${kib(added.gzip)} |`);
	}

	lines.push("", "The \"already bundled\" columns above use the full `Decimal` constructor from `@neutrium/decimal`. Its baseline is " +
		`${kib(report.baselines.full.minified)} minified / ${kib(report.baselines.full.gzip)} gzipped.`, "",
		"### If you use a different Decimal tier", "",
		"This table shows the cost of adding the **default formatter** to each existing Decimal tier. All scenario/tier combinations, exact byte counts, combined totals, and entry sources are also recorded in `dist/bundle-sizes.json`.", "",
		"| Existing Decimal import | Existing minified | Existing gzipped | Formatter adds, minified | Formatter adds, gzipped |",
		"| --- | ---: | ---: | ---: | ---: |");

	const formatter = report.scenarios.find(item => item.id === "default-format");

	for (const [name, baseline] of Object.entries(report.baselines))
	{
		const added = formatter.withDecimal[name].added;
		lines.push(`| \`${baseline.entry}\` | ${kib(baseline.minified)} | ${kib(baseline.gzip)} | ${kib(added.minified)} | ${kib(added.gzip)} |`);
	}

	return lines.join("\n");
}

export function replaceSizes(guide, section)
{
	assert.equal(guide.split(begin).length, 2, "Size guide must contain exactly one opening marker");
	assert.equal(guide.split(end).length, 2, "Size guide must contain exactly one closing marker");
	const start = guide.indexOf(begin) + begin.length;
	const finish = guide.indexOf(end);
	assert.ok(finish >= start, "Size guide markers are reversed");

	return `${guide.slice(0, start)}\n\n${section}\n\n${guide.slice(finish)}`;
}

async function main(mode)
{
	assert.ok(["--write", "--check"].includes(mode), "Usage: node tools/bundle-sizes.mjs --write|--check (build dist first)");
	const guidePath = new URL("guides/bundle-size.md", root);
	const reportPath = new URL("dist/bundle-sizes.json", root);
	const guide = await readFile(guidePath, "utf8");
	// Validate marker boundaries before spending time bundling or updating files.
	replaceSizes(guide, "");
	const report = await measureSizes();
	const updated = replaceSizes(guide, renderSizes(report));
	const json = JSON.stringify(report, null, 2) + "\n";

	if (mode === "--write")
	{
		if (updated !== guide)
		{
			await writeFile(guidePath, updated);
		}

		await writeFile(reportPath, json);
		console.log(`Updated bundle sizes for ${report.scenarios.length} usage scenarios and ${Object.keys(report.baselines).length} Decimal tiers.`);
	}
	else
	{
		assert.equal(updated, guide, "Bundle size guide is stale; run pnpm run build");
		assert.equal(await readFile(reportPath, "utf8"), json, "Bundle size JSON is stale; run pnpm run build");
		console.log("Bundle size guide and JSON match the current build.");
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
{
	assert.equal(process.argv.length, 3, "Usage: node tools/bundle-sizes.mjs --write|--check");
	await main(process.argv[2]);
}
