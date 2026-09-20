import test from "node:test";
import assert from "node:assert/strict";
import { formatter } from "@neutrium/formatter";
import { parser } from "@neutrium/formatter/parse";
import { normalizeNumericSpec, numberFormatOptions } from "../dist/numeric/shared/options.js";

const commonIntl = {
	numberingSystem: "latn", useGrouping: "min2", minimumIntegerDigits: 2,
	minimumFractionDigits: 1, maximumFractionDigits: 3,
	minimumSignificantDigits: 2, maximumSignificantDigits: 4,
	roundingMode: "halfEven", roundingIncrement: 1, roundingPriority: "morePrecision",
	trailingZeroDisplay: "stripIfInteger", signDisplay: "exceptZero",
};
const commonWrapper = {
	locale: "en-US", negativeDisplay: "parentheses", groupSeparator: "_", decimalSeparator: ":",
	zeroDisplay: "zero", nanDisplay: "missing", infinityDisplay: "unbounded",
};
const notation = { notation: "compact", compactDisplay: "long", compactExponent: 3 };
const domains = [
	[{ kind: "number", ...notation }, { style: "decimal", notation: "standard", compactDisplay: "long" }],
	[{ kind: "currency", ...notation, currency: "usd", currencyDisplay: "name", currencySign: "accounting", currencySymbol: "money" },
		{ style: "currency", notation: "standard", compactDisplay: "long", currency: "USD", currencyDisplay: "name", currencySign: "accounting" }],
	[{ kind: "unit", ...notation, unit: "meter", unitDisplay: "long", unitSymbol: "distance" },
		{ style: "unit", notation: "standard", compactDisplay: "long", unit: "meter", unitDisplay: "long" }],
	[{ kind: "percentage", percentageScale: 1000, percentageSymbol: "pct" }, { style: "percent" }],
	[{ kind: "ordinal", ordinalFallback: "number", ordinalPatterns: { other: "{number}th" } }, { style: "decimal" }],
	[{ kind: "bytes", byteBase: 1000, byteExponent: 2 }, { style: "decimal" }],
];

test("numeric descriptors forward native options and keep wrapper options out of Intl", () => {
	for (const [domain, expectedDomain] of domains) {
		const spec = { ...domain, ...commonIntl, ...commonWrapper };
		const expected = { ...expectedDomain, ...commonIntl };
		assert.deepEqual(numberFormatOptions(normalizeNumericSpec(spec)), expected, domain.kind);
		assert.deepEqual(formatter.compile(spec).resolution.intl.requestedOptions, expected, domain.kind);
		assert.deepEqual(parser.compile(spec).resolution.intl.requestedOptions, expected, domain.kind);
		assert.equal(spec.currency, domain.currency, "currency normalization must not mutate the caller");
	}
});

test("mapping preserves native notation and explicit overrides of domain defaults", () => {
	for (const [spec, expected] of [
		[{ kind: "number" }, { style: "decimal" }],
		[{ kind: "percentage" }, { style: "percent" }],
		[{ kind: "bytes" }, { style: "decimal", maximumFractionDigits: 1 }],
		[{ kind: "ordinal", maximumFractionDigits: undefined }, { style: "decimal", maximumFractionDigits: 0 }],
		[{ kind: "bytes", maximumFractionDigits: 0 }, { style: "decimal", maximumFractionDigits: 0 }],
		[{ kind: "ordinal", maximumFractionDigits: 2 }, { style: "decimal", maximumFractionDigits: 2 }],
	]) assert.deepEqual(numberFormatOptions(normalizeNumericSpec(spec)), expected);
	for (const domain of [{ kind: "number" }, { kind: "currency", currency: "usd" }, { kind: "unit", unit: "meter" }]) {
		for (const notation of ["standard", "scientific", "engineering", "compact"]) {
			const options = numberFormatOptions(normalizeNumericSpec({ ...domain, notation }));
			assert.equal(options.notation, notation);
		}
		const options = numberFormatOptions(normalizeNumericSpec({ ...domain, compactExponent: 3 }));
		assert.equal(options.notation, "standard");
		options.maximumFractionDigits = 10;
		assert.equal(numberFormatOptions(normalizeNumericSpec(domain)).maximumFractionDigits, undefined);
	}
});

test("consolidated mapping captures every supplied numeric option once", () => {
	for (const [domain] of domains) {
		const values = { ...domain, ...commonIntl, ...commonWrapper };
		delete values.kind;
		const inherited = {};
		const reads = {};
		for (const [name, value] of Object.entries(values)) {
			Object.defineProperty(inherited, name, { get() {
				reads[name] = (reads[name] ?? 0) + 1;
				assert.equal(reads[name], 1, `${domain.kind}.${name}`);
				return value;
			} });
		}
		const spec = Object.assign(Object.create(inherited), { kind: domain.kind });
		formatter.formatDetailed("1234.56", spec);
		assert.deepEqual(reads, Object.fromEntries(Object.keys(values).map(name => [name, 1])));
	}
});
