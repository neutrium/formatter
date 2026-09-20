import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { gzipSync } from "node:zlib";

test("individual numeric codecs retain only their rendering and parser grammar domains", async () => {
	const require = createRequire(import.meta.resolve("vite"));
	const { rolldown } = await import(require.resolve("rolldown"));
	const sizes = {};

	for (const parsing of [false, true])
	{
		for (const [name, domain] of Object.entries({ number: "native", currency: "native", unit: "native", bytes: "bytes", ordinal: "ordinal", percentage: "percentage" }))
		{
			const codec = name + (parsing ? "Parser" : "Codec");
			const id = new URL("../../selective-check.js", import.meta.url).pathname;
			const bundle = await rolldown({ input: id, plugins: [{
				name: "selective-entry",
				resolveId(path) { if (path === id) return id; },
				load(path) {
					if (path === id) return `import { ${parsing ? "Parser" : "Formatter"}, ${codec} } from './dist/${parsing ? "extensions-parse" : "extensions"}.js';
						export const instance = new ${parsing ? "Parser" : "Formatter"}({ codecs: [${codec}] });`;
				},
			}] });

			try
			{
				const result = await bundle.generate({ format: "esm", minify: true });
				const chunks = result.output.filter(item => item.type === "chunk");
				const modules = chunks.flatMap(chunk => Object.keys(chunk.modules));
				assert.deepEqual(modules.filter(path => path.endsWith("/runtime-diagnostics.js")), [], codec);
				assert.deepEqual(modules.filter(path => /\/numeric\/(native|bytes|ordinal|percentage)\/formatter\.js$/.test(path)).map(path => path.split("/").at(-2)), [domain], codec);
				assert.deepEqual(modules.filter(path => /\/numeric\/(native|bytes|ordinal|percentage)\/grammar\.js$/.test(path))
					.map(path => path.split("/").at(-2)), parsing ? [domain] : [], codec);
				assert.equal(modules.filter(path => path.endsWith("/numeric/ordinal/patterns.js")).length,
					domain === "ordinal" ? 1 : 0, `${codec} must not retain unrelated ordinal templates or locale discovery`);
				if (domain !== "native")
				{
					assert.deepEqual(modules.filter(path => /\/(compact|cardinals|cardinal-data)\.js$/.test(path)), [], codec);
				}

				if (!parsing)
				{
					assert.deepEqual(modules.filter(path => /\/(Parser|parser|parse-codecs)\.js$/.test(path)), [], codec);
				}

				if (parsing)
				{
					assert.deepEqual(modules.filter(path => /\/numeric\/(?:shared\/(?:orchestration|codec-factory)|codecs)\.js$/.test(path)), [], codec);
				}

				sizes[codec] = gzipSync(chunks.map(chunk => chunk.code).join("\n")).length;

				if (parsing)
				{
					const budgets = { native: 22100, bytes: 18500, ordinal: 18650, percentage: 17900 };
					assert.ok(sizes[codec] < budgets[domain], `${codec} gzip budget: ${sizes[codec]}`);
					// Execute the tree-shaken artifact, not just the source modules.
					const { instance } = await import(`data:text/javascript;base64,${Buffer.from(chunks[0].code).toString("base64")}`);
					const cases = {
						number: ["1.2K", { kind: "number", notation: "compact", compactExponent: 3, maximumFractionDigits: 1 }, "1200"],
						currency: ["$1.25", { kind: "currency", currency: "USD" }, "1.25"],
						unit: ["1.25 m", { kind: "unit", unit: "meter" }, "1.25"],
						bytes: ["0.5 KiB", { kind: "bytes" }, "512"],
						ordinal: ["23rd", { kind: "ordinal" }, "23"],
						percentage: ["1.25%", { kind: "percentage", percentageScale: 1000, maximumFractionDigits: 2 }, "0.00125"],
					};
					const [text, spec, expected] = cases[name];
					assert.equal(instance.parse(text, spec), expected, codec);
					const compiled = instance.compile(spec);
					assert.equal(compiled.parse(` ${text} `), expected, codec);
					assert.throws(() => compiled.parse(`${text} junk`), /Invalid formatted/, codec);
				}
			}
			finally
			{
				await bundle.close();
			}
		}
	}
	console.log("Selective bundle gzip bytes:", sizes);
});

test("parsing entries exclude localized duration rendering", async () => {
	const require = createRequire(import.meta.resolve("vite"));
	const { rolldown } = await import(require.resolve("rolldown"));
	for (const entry of ["parse", "extensions-parse"]) {
		const bundle = await rolldown({ input: new URL(`../../dist/${entry}.js`, import.meta.url).pathname });
		try {
			const result = await bundle.generate({ format: "esm", minify: true });
			const modules = result.output.filter(item => item.type === "chunk").flatMap(chunk => Object.keys(chunk.modules));
			assert.deepEqual(modules.filter(path => path.endsWith("/runtime-diagnostics.js")), []);
			assert.ok(modules.some(path => path.endsWith("/duration/elapsed.js")));
			assert.deepEqual(modules.filter(path => /\/numeric\/(?:shared\/(?:orchestration|codec-factory)|codecs)\.js$/.test(path)), []);
			assert.deepEqual(modules.filter(path => /\/duration\/(?:localized|formatter|codec)\.js$/.test(path)), []);
		} finally { await bundle.close(); }
	}
});

test("authoring entries avoid singleton initialization and formatting authors do not load parsers", async () => {
	const require = createRequire(import.meta.resolve("vite"));
	const { rolldown } = await import(require.resolve("rolldown"));
	for (const entry of ["extensions", "extensions-parse"]) {
		const bundle = await rolldown({ input: new URL(`../../dist/${entry}.js`, import.meta.url).pathname });
		try {
			const result = await bundle.generate({ format: "esm" });
			const modules = result.output.filter(item => item.type === "chunk").flatMap(chunk => Object.keys(chunk.modules));
			assert.deepEqual(modules.filter(path => /\/dist\/(?:index|formatter|parse|create-formatter|create-parser)\.js$/.test(path)), []);
			if (entry === "extensions") {
				assert.deepEqual(modules.filter(path => /\/(?:Parser|parser|parse-codecs?)\.js$/.test(path)), []);
				assert.deepEqual(modules.filter(path => /\/numeric\/(native|bytes|ordinal|percentage)\/grammar\.js$/.test(path)), []);
			}
		} finally { await bundle.close(); }
	}
});

test("format-only bundles exclude localized parsers and combined bundles share implementation modules", async () => {
	const require = createRequire(import.meta.resolve("vite"));
	const { rolldown } = await import(require.resolve("rolldown"));
	const sizes = [];
	for (const full of [false, true]) {
		const id = new URL("../../bundle-check.js", import.meta.url).pathname;
		const bundle = await rolldown({ input: id, plugins: [{
			name: "in-memory-entry",
			resolveId(path) { if (path === id) return id; },
			load(path) {
				if (path === id) return `import { formatter } from './dist/index.js';
					export const format = (value, spec) => formatter.format(value, spec);
					${full ? "import { parser } from './dist/parse.js'; export const parse = (text, spec) => parser.parse(text, spec);" : ""}`;
			},
		}] });
		try {
			const result = await bundle.generate({ format: "esm", minify: true });
			const chunks = result.output.filter(item => item.type === "chunk");
			const modules = chunks.flatMap(chunk => Object.keys(chunk.modules));
			assert.deepEqual(modules.filter(path => path.endsWith("/runtime-diagnostics.js")), []);
			const code = chunks.map(chunk => chunk.code).join("\n");
			const size = { minified: Buffer.byteLength(code), gzip: gzipSync(code).length };
			sizes.push(size);
			assert.equal(modules.filter(path => path.endsWith("/numeric/shared/engine.js")).length, 1);
			assert.equal(modules.filter(path => path.endsWith("/numeric/shared/decimal-string.js")).length, 1);
			if (full) assert.equal(modules.filter(path => path.endsWith("/parser.js")).length, 2);
			else {
				assert.deepEqual(modules.filter(path => /\/(?:Parser|parser|parse-codecs?)\.js$/.test(path)), []);
				// Includes deduplicated CLDR cardinal rules for exact decimal operands.
				// Scalar/collection adapters add a small formatting cost while shrinking parser-only bundles.
				assert.ok(size.gzip < 25700, `format-only gzip budget: ${size.gzip}`);
			}
		} finally { await bundle.close(); }
	}
	assert.ok(sizes[0].gzip < sizes[1].gzip * 0.93, JSON.stringify(sizes));
	console.log("Bundle bytes (format-only, combined):", sizes);
});
