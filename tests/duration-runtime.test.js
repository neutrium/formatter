import test from "node:test";
import assert from "node:assert/strict";
import { runIsolated } from "./helpers/isolated-process.js";
import { withProperty } from "./helpers/intl-probes.js";
import { formatter, renderTokens } from "@neutrium/formatter";
import { parser } from "@neutrium/formatter/parse";

const localized = { kind: "duration", presentation: "localized", style: "digital", fractionalDigits: 3 };
const elapsed = { kind: "duration", presentation: "elapsed" };

test("missing duration service rejects localized rendering, including warmed compiled formats", () => {
	const compiled = formatter.compile(localized);
	const compiledElapsed = formatter.compile(elapsed);
	assert.equal(compiled.format("3661.125"), "1:01:01.125");
	for (const unavailable of [undefined, null, {}]) {
		withProperty(Intl, "DurationFormat", { value: unavailable }, () => {
			assert.equal(formatter.supports(localized), false);
			const resolution = formatter.resolve(localized);
			assert.equal(resolution.error.name, "RangeError");
			assert.match(resolution.error.message, /Intl.DurationFormat.*polyfill/);
			for (const run of [
				() => formatter.format("3661.125", localized),
				() => formatter.format({ minutes: 1 }, localized),
				() => formatter.format(NaN, localized),
				() => formatter.formatToParts(Infinity, localized),
				() => formatter.formatDetailed(1, localized),
				() => formatter.compile(localized),
				() => formatter.compileSeries([], localized),
				() => compiled.format(1),
				() => compiled.formatToParts(1),
				() => compiled.formatDetailed(1),
			]) assert.throws(run, { name: "RangeError", message: resolution.error.message });
			assert.equal(formatter.supports(elapsed), true);
			assert.equal(formatter.format(3661, elapsed), "1:01:01");
			assert.equal(renderTokens(compiledElapsed.formatToParts(3661)), "1:01:01");
			assert.equal(compiledElapsed.formatDetailed(3661).roundedValue, "3661");
			assert.equal(parser.parse("1:01:01", elapsed), "3661");
			assert.equal(formatter.format(123, { kind: "number" }), "123");
		});
	}
	assert.equal(formatter.supports(localized), true);
	assert.equal(compiled.format("3661.125"), "1:01:01.125");
});

test("duration service can be absent at import without preventing elapsed operations", () => {
	runIsolated(`
		Intl.DurationFormat = undefined;
		const { formatter } = await import('./dist/index.js');
		const { parser } = await import('./dist/parse.js');
		const { runtimeCapabilities } = await import('./dist/diagnostics.js');
		assert.equal(runtimeCapabilities().durationFormat, false);
		assert.equal(formatter.supports(${JSON.stringify(localized)}), false);
		assert.throws(() => formatter.compile(${JSON.stringify(localized)}), /Intl.DurationFormat/);
		assert.equal(formatter.compile(${JSON.stringify(elapsed)}).format(3661), '1:01:01');
		assert.equal(parser.compile(${JSON.stringify(elapsed)}).parse('1:01:01'), '3661');
	`);
});

test("native localized durations do not require ListFormat or DateTimeFormat", () => {
	withProperty(Intl, "ListFormat", { value: undefined }, () =>
		withProperty(Intl, "DateTimeFormat", { value: undefined }, () => {
		const spec = { ...localized, locale: "en-GB" };
		assert.equal(formatter.supports(spec), true);
		assert.equal(formatter.format("3661.125", spec), "1:01:01.125");
		assert.equal(renderTokens(formatter.formatToParts("3661.125", spec)), "1:01:01.125");
	}));
});
