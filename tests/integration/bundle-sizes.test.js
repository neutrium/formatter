import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { bundleSource, decimalSource, measureCode, replaceSizes, scenarios } from "../../tools/bundle-sizes.mjs";

const root = new URL("../../", import.meta.url);

test("generated size guide and exact-byte report reproduce from the built package", () => {
	execFileSync(process.execPath, ["tools/bundle-sizes.mjs", "--check"], { cwd: root, stdio: "pipe" });
});

test("existing-Decimal measurements include working APIs and share dependency modules", async () => {
	const report = JSON.parse(await readFile(new URL("dist/bundle-sizes.json", root), "utf8"));
	const scenario = scenarios.find(item => item.id === "default-both");
	const baseline = await bundleSource(decimalSource("@neutrium/decimal"));
	const combined = await bundleSource(`${decimalSource("@neutrium/decimal")}\n${scenario.source}`);
	assert.equal(combined.modules.filter(path => path.endsWith("/ArithmeticDecimal.js")).length, 1);
	assert.equal(combined.modules.filter(path => path.endsWith("/ScientificDecimal.js")).length, 1);
	const api = await import(`data:text/javascript;base64,${Buffer.from(combined.code).toString("base64")}`);
	const spec = { kind: "currency", currency: "USD" };
	assert.equal(api.format(new api.Decimal("12.5"), spec), "$12.50");
	assert.equal(api.parse("$12.50", spec), "12.5");
	const measured = report.scenarios.find(item => item.id === scenario.id).withDecimal.full;
	const baseSize = measureCode(baseline.code);
	const total = measureCode(combined.code);
	assert.deepEqual(measured.total, total);
	assert.equal(measured.added.minified, total.minified - baseSize.minified);
	assert.equal(measured.added.gzip, total.gzip - baseSize.gzip);
	assert.ok(measured.added.gzip < report.scenarios.find(item => item.id === scenario.id).standalone.gzip);
});

test("size refresh preserves hand-written guidance and rejects ambiguous marker boundaries", () => {
	const guide = "Before\n<!-- bundle-sizes:start -->\nold\n<!-- bundle-sizes:end -->\nAfter\n";
	assert.equal(replaceSizes(guide, "new"), "Before\n<!-- bundle-sizes:start -->\n\nnew\n\n<!-- bundle-sizes:end -->\nAfter\n");
	assert.throws(() => replaceSizes("Missing markers", "new"));
	assert.throws(() => replaceSizes(guide + "<!-- bundle-sizes:start -->", "new"));
	assert.throws(() => replaceSizes("<!-- bundle-sizes:end --><!-- bundle-sizes:start -->", "new"));
});
