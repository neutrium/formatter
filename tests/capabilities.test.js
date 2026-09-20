import { runtimeCapabilities } from "@neutrium/formatter/diagnostics";
import test from "node:test";
import assert from "node:assert/strict";
import { Formatter } from "@neutrium/formatter/extensions";
import { formatter as builtInFormatter, createFormatter, formatter, UnsupportedParseError, UnsupportedRangeError } from "@neutrium/formatter";
import { parser } from "@neutrium/formatter/parse";
import { Parser } from "@neutrium/formatter/extensions/parse";

test("reports an immutable snapshot of relevant Intl runtime capabilities", () => {
	const capabilities = runtimeCapabilities();
	assert.equal(capabilities.numberFormat, true);
	assert.equal(capabilities.numberFormatRange, true);
	assert.equal(capabilities.exactDecimalStrings, true);
	assert.equal(capabilities.unitFormat, true);
	assert.equal(capabilities.compactNotation, true);
	assert.equal(capabilities.roundingMode, true);
	assert.equal(capabilities.roundingIncrement, true);
	assert.equal(capabilities.roundingPriority, true);
	assert.equal(capabilities.trailingZeroDisplay, true);
	assert.equal(capabilities.negativeSignDisplay, true);
	assert.ok(Object.isFrozen(capabilities));
	assert.strictEqual(runtimeCapabilities(), capabilities);
});

test("resolves effective Intl options and operation capabilities", () => {
	const resolved = builtInFormatter.resolve({ kind: "unit", unit: "meter" });
	assert.equal(resolved.supported, true);
	assert.equal(resolved.kind, "unit");
	assert.equal(resolved.locale, "en-US");
	assert.equal(resolved.implementation, "intl-number-format");
	assert.equal(resolved.capabilities.parse, false);
	assert.equal(resolved.capabilities.rangeImplementation, "native");
	assert.deepEqual(resolved.intl.requestedOptions, { style: "unit", unit: "meter" });
	assert.equal(resolved.intl.resolvedOptions.unitDisplay, "short");
	assert.equal(resolved.intl.resolvedOptions.maximumFractionDigits, 3);
	assert.ok(Object.isFrozen(resolved));
	assert.ok(Object.isFrozen(resolved.capabilities));
	assert.ok(Object.isFrozen(resolved.intl.resolvedOptions));

	assert.equal(
		builtInFormatter.resolve({ kind: "number", negativeDisplay: "parentheses" })
			.capabilities.rangeImplementation,
		"conditional",
	);
	assert.equal(builtInFormatter.resolve({ kind: "bytes" }).capabilities.rangeImplementation, "fallback");
	assert.equal(builtInFormatter.resolve({ kind: "duration", presentation: "elapsed" }).capabilities.rangeImplementation, "unsupported");
});

test("reports unsupported specifications without throwing", () => {
	const spec = { kind: "unit", unit: "furlong-per-fortnight" };
	assert.equal(builtInFormatter.supports(spec), false);
	const resolved = builtInFormatter.resolve(spec);
	assert.equal(resolved.supported, false);
	assert.equal(resolved.implementation, null);
	assert.equal(resolved.error.name, "RangeError");
	assert.match(resolved.error.message, /unit/i);
	assert.equal(resolved.capabilities.format, false);
	assert.equal(resolved.capabilities.rangeImplementation, "unsupported");
	assert.throws(() => builtInFormatter.compile(spec), /unit/i);
});

test("reports native localized-duration implementation", () => {
	const resolved = builtInFormatter.resolve({ kind: "duration", presentation: "localized", style: "long" });
	assert.equal(runtimeCapabilities().durationFormat, true);
	assert.equal(resolved.supported, true);
	assert.equal(resolved.capabilities.parse, false);
	assert.equal(resolved.implementation, "intl-duration-format");
	assert.equal(resolved.intl.service, "DurationFormat");
	assert.equal(resolved.intl.resolvedOptions.style, "long");
	assert.equal("listFormat" in runtimeCapabilities(), false);
});

test("compiled formatters expose only operations supported by their resolved presentation", () => {
	const numeric = builtInFormatter.compile({ kind: "number" });
	assert.equal(typeof numeric.parse, "undefined");
	assert.equal(typeof numeric.formatRange, "function");

	const elapsed = builtInFormatter.compile({ kind: "duration", presentation: "elapsed" });
	assert.equal(typeof elapsed.parse, "undefined");
	assert.equal(elapsed.formatRange, undefined);

	const localized = builtInFormatter.compile({ kind: "duration", presentation: "localized", style: "long" });
	assert.equal(localized.parse, undefined);
	assert.equal(localized.formatRange, undefined);
	assert.equal(localized.resolution.capabilities.parse, false);

	const formatOnly = new Formatter({
		codecs: [{ kind: "label", format: (value) => [{ type: "literal", value }] }],
	}).compile({ kind: "label" });
	assert.equal(formatOnly.parse, undefined);
	assert.equal(formatOnly.resolution.capabilities.parse, false);
});

test("propagates metadata failures instead of silently omitting them", () => {
	const formatter = new Formatter({
		codecs: [{
			kind: "broken-metadata",
			format: () => [{ type: "literal", value: "value" }],
			formatDetailed: () => { throw new Error("metadata failed"); },
		}],
	});
	assert.throws(
		() => formatter.formatDetailed("value", { kind: "broken-metadata" }),
		/metadata failed/,
	);
});

test("returns formatted parts, rounded values, scales, and resolution metadata", () => {
	const compact = builtInFormatter.formatDetailed(1_234_567, {
		kind: "unit",
		unit: "meter",
		notation: "compact",
		maximumFractionDigits: 2,
	});
	assert.equal(compact.text, "1.23M m");
	assert.equal(compact.roundedValue, "1230000");
	assert.deepEqual(compact.scale, { kind: "decimal", exponent: 6 });
	assert.equal(compact.parts.at(-1).value, "m");
	assert.equal(compact.resolution.supported, true);
	assert.equal("value" in compact, false);
	assert.equal("resolved" in compact, false);

	const bytes = builtInFormatter.formatDetailed(1536, { kind: "bytes" });
	assert.equal(bytes.roundedValue, "1536");
	assert.deepEqual(bytes.scale, { kind: "binary", exponent: 10 });

	const localizedDuration = builtInFormatter.formatDetailed(3661, { kind: "duration", presentation: "localized", style: "long" });
	assert.equal("roundedValue" in localizedDuration, false);
});

test("exposes resolution and detailed formatting on configured and compiled formatters", () => {
	const formatter = createFormatter({ locale: "de-DE" });
	const spec = { kind: "number", maximumFractionDigits: 1 };
	assert.equal(formatter.supports(spec), true);
	assert.equal(formatter.resolve(spec).locale, "de-DE");
	assert.equal(formatter.formatDetailed(1.25, spec).roundedValue, "1.3");

	const compiled = builtInFormatter.compile({ kind: "number", notation: "compact" });
	assert.equal(compiled.resolution.supported, true);
	assert.equal(compiled.formatDetailed(1200).scale.exponent, 3);

	const custom = new Formatter({
		codecs: [{
			kind: "identity",
			format: (value) => [{ type: "literal", value }],
			formatDetailed: (value) => ({ parts: [{ type: "literal", value }], roundedValue: value }),
		}],
	});
	const customResolved = custom.resolve({ kind: "identity" });
	assert.equal(customResolved.supported, true);
	assert.equal(customResolved.implementation, "custom");
	assert.equal(customResolved.capabilities.range, false);
	assert.equal(custom.formatDetailed("value", { kind: "identity" }).roundedValue, "value");
	assert.equal(custom.supports({ kind: "missing" }), false);
});

test("compilation preserves original errors while resolution stays serializable", () => {
	assert.throws(() => formatter.compile({ kind: "number", maximumFractionDigits: -1 }), RangeError);
	class CodecError extends Error {}
	for (const failure of [new CodecError("bad spec", { cause: new Error("cause") }), { reason: "invalid" }]) {
		let calls = 0;
		const custom = createFormatter().withCodec({
			kind: "broken", format: () => [], resolve: () => { calls++; throw failure; },
		});
		assert.throws(() => custom.compile({ kind: "broken" }), error => error === failure);
		assert.equal(calls, 1);
		const resolved = custom.resolve({ kind: "broken" });
		assert.equal(resolved.supported, false);
		assert.deepEqual(JSON.parse(JSON.stringify(resolved.error)), {
			name: failure instanceof Error ? failure.name : "Error",
			message: failure instanceof Error ? failure.message : String(failure),
		});
	}
});

test("inspection contains throwing discriminators and preserves the original failure", () => {
	const failure = new TypeError("cannot read kind");
	for (const instance of [formatter, parser]) {
		let reads = 0;
		const spec = { get kind() { reads++; throw failure; } };
		const resolved = instance.resolve(spec);
		assert.equal(reads, 1);
		assert.equal(resolved.supported, false);
		assert.equal(resolved.kind, "");
		assert.deepEqual(resolved.error, { name: "TypeError", message: "cannot read kind" });
		assert.ok(Object.isFrozen(resolved));
		assert.equal(instance.supports(spec), false);
		assert.equal(reads, 2);
		// Operational methods still throw the original exception.
		assert.throws(() => instance === parser ? instance.parse("1", spec) : instance.format(1, spec), error => error === failure);
		for (const invalid of [null, undefined, {}, { kind: "missing" }])
			assert.equal(instance.resolve(invalid).supported, false);
	}
});

test("resolved parsing and range restrictions apply to direct and compiled operations", () => {
	const codec = {
		kind: "conditional", format: value => [{ type: "literal", value: String(value) }],
		parse: input => input,
		formatRange: () => [{ type: "literal", value: "range", source: "shared" }],
		resolve: spec => ({ parse: !spec.disabled, rangeImplementation: spec.disabled ? "unsupported" : "custom" }),
	};
	const custom = new Formatter({ codecs: [codec] });
	const parsing = new Parser({ codecs: [codec] });
	const spec = { kind: "conditional", disabled: true };
	assert.throws(() => parsing.parse("1", spec), UnsupportedParseError);
	assert.throws(() => custom.formatRange(1, 2, spec), UnsupportedRangeError);
	assert.throws(() => custom.formatRangeToParts(1, 2, spec), UnsupportedRangeError);
	const compiled = custom.compile(spec);
	assert.equal(compiled.parse, undefined);
	assert.equal(compiled.formatRange, undefined);
	spec.disabled = false;
	assert.equal(parsing.parse("1", spec), "1");
	assert.equal(custom.formatRange(1, 2, spec), "range");
	assert.equal(parsing.compile(spec).parse("1"), "1");
	assert.equal(compiled.parse, undefined);
});

test("every direct operation preserves resolution failures including empty collections", () => {
	const failure = new RangeError("unsupported spec");
	const codec = {
		kind: "rejected", resolve: () => { throw failure; },
		format: () => assert.fail("format must not run"),
		formatString: () => assert.fail("formatString must not run"),
		parse: () => assert.fail("parse must not run"),
		formatRange: () => assert.fail("range must not run"),
	};
	const custom = new Formatter({ codecs: [codec] });
	const parsing = new Parser({ codecs: [codec] });
	const spec = { kind: "rejected" };
	for (const run of [
		() => custom.format(1, spec), () => custom.formatToParts(1, spec),
		() => custom.formatDetailed(1, spec), () => parsing.parse("1", spec),
		() => custom.formatRange(1, 2, spec), () => custom.formatRangeToParts(1, 2, spec),
		() => custom.formatSeries([], spec), () => custom.formatSeriesToParts([], spec),
		() => custom.formatColumn([], spec), () => custom.compile(spec),
	]) assert.throws(run, error => error === failure);
	assert.equal(custom.supports(spec), false);
});

test("resolution rejects claimed capabilities with no implementation", () => {
	for (const capability of [{ parse: true }, { rangeImplementation: "custom" }]) {
		const custom = new Formatter({ codecs: [{ kind: "broken", format: () => [], resolve: () => capability }] });
		assert.equal(custom.supports({ kind: "broken" }), false);
		assert.throws(() => custom.compile({ kind: "broken" }), TypeError);
		assert.throws(() => custom.format(1, { kind: "broken" }), TypeError);
	}
});
