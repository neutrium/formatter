import test from "node:test";
import assert from "node:assert/strict";
import { Decimal } from "@neutrium/decimal/arithmetic";
import { parseQuantity, normalizeNumericRange, addQuantities, decimalOrder,
	dividePowerOfTwo, roundQuantityToInteger } from "../dist/numeric/shared/decimal-string.js";
import { byteEngine, nativeEngine, ordinalEngine, percentageEngine } from "../dist/numeric/engines.js";
import { createNumericEngine } from "../dist/numeric/shared/engine.js";
import { nativeDomain } from "../dist/numeric/native/formatter.js";
import { byteDomain } from "../dist/numeric/bytes/formatter.js";
import { ordinalDomain } from "../dist/numeric/ordinal/formatter.js";
import { percentageDomain } from "../dist/numeric/percentage/formatter.js";
import { withProperty } from "./helpers/intl-probes.js";

test("rounded metadata stays Decimal until the public detailed-result boundary", () => {
	const rounded = parseQuantity("1e400");
	const toFixed = rounded.toFixed.bind(rounded);
	let serializations = 0;
	rounded.toFixed = (...args) => { serializations++; return toFixed(...args); };
	const engine = createNumericEngine({ prepare(...args) {
		return { ...nativeDomain.prepare(...args), metadata: () => ({ quantity: rounded }) };
	} });
	const execution = engine.prepare({ kind: "number" }, { locale: "en-US", data: {} });
	assert.strictEqual(execution.detailed(parseQuantity(1)).quantity, rounded);
	assert.equal(execution.saturate(parseQuantity("1e300")).isFinite(), false);
	assert.equal(serializations, 0);
	const result = execution.detailedValue(1);
	assert.equal(result.roundedValue, "1" + "0".repeat(400));
	assert.equal("quantity" in result, false);
	assert.equal(serializations, 1);
});

test("accounting currency scalar plans retain a lazy parentheses rendering variant", () => {
	const calls = [];
	let preparations = 0;
	const engine = createNumericEngine({ prepare(spec, context, formatter) {
		preparations++;
		const plan = nativeDomain.prepare(spec, context, formatter);
		return { ...plan, render(value, capture) {
			calls.push({ spec, formatter });
			return plan.render(value, capture);
		} };
	} });
	const plan = engine.prepare({ kind: "currency", currency: "USD", currencySign: "accounting",
		negativeDisplay: "parentheses" }, { locale: "en-US", data: {} });
	const text = value => plan.format(value).map(part => part.value).join("");
	assert.equal(text(1), "$1.00");
	assert.equal(preparations, 1, "Positive values do not prepare the accounting sign variant");
	assert.equal(text(-1), "($1.00)");
	assert.equal(text(-2), "($2.00)");
	assert.equal(text(2), "$2.00");
	assert.strictEqual(calls[0].spec, plan.spec);
	assert.strictEqual(calls[3].spec, plan.spec);
	assert.strictEqual(calls[0].formatter, plan.formatter);
	assert.strictEqual(calls[3].formatter, plan.formatter);
	assert.notStrictEqual(calls[1].spec, plan.spec);
	assert.strictEqual(calls[1].spec, calls[2].spec);
	assert.strictEqual(calls[1].formatter, calls[2].formatter);
	assert.equal(calls[1].spec.currencySign, "standard");
	assert.equal(plan.spec.currencySign, "accounting");
	assert.equal(preparations, 2, "Only the root and its lazy sign variant prepare domain resources");
});

test("parentheses reuse the root domain unless accounting currency needs different Intl options", () => {
	for (const [domain, spec, value, expected] of [
		[nativeDomain, { kind: "number" }, -1, "(1)"],
		[nativeDomain, { kind: "currency", currency: "USD" }, -1, "($1.00)"],
		[nativeDomain, { kind: "currency", currency: "USD", currencySign: "standard" }, -1, "($1.00)"],
		[nativeDomain, { kind: "unit", unit: "meter" }, -1, "(1 m)"],
		[nativeDomain, { kind: "number", compactExponent: 3 }, -1000, "(1K)"],
		[byteDomain, { kind: "bytes", byteExponent: 1 }, -1024, "(1 KiB)"],
		[ordinalDomain, { kind: "ordinal" }, -1, "(1st)"],
		[percentageDomain, { kind: "percentage" }, -0.01, "(1%)"],
	]) {
		let preparations = 0;
		const engine = createNumericEngine({ prepare(...args) {
			preparations++;
			return domain.prepare(...args);
		} });
		const plan = engine.prepare({ ...spec, negativeDisplay: "parentheses" }, { locale: "en-US", data: {} });
		assert.equal(plan.formatString(value), expected);
		assert.equal(plan.format(value).map(part => part.value).join(""), expected);
		assert.equal(plan.detailedValue(value).parts.map(part => part.value).join(""), expected);
		assert.equal(preparations, 1, JSON.stringify(spec));
	}
});

test("scalar plans bind optional rendering hooks once while retaining their receiver", () => {
	let stringReads = 0, metadataReads = 0, strings = 0;
	const engine = createNumericEngine({ prepare(...args) {
		const native = nativeDomain.prepare(...args);
		const domain = {
			...native,
			get string() {
				stringReads++;
				return function (value) { assert.strictEqual(this, domain); strings++; return native.string(value); };
			},
			get metadata() {
				metadataReads++;
				return function (...values) { assert.strictEqual(this, domain); return native.metadata(...values); };
			},
		};
		return domain;
	} });
	const plan = engine.prepare({ kind: "number", negativeDisplay: "parentheses" }, { locale: "en-US", data: {} });
	assert.deepEqual([stringReads, metadataReads], [1, 1]);
	for (const value of [1, 2, 3]) {
		assert.equal(plan.formatString(value), String(value));
		assert.equal(plan.formatString(-value), `(${value})`);
		assert.equal(plan.detailedValue(value).roundedValue, String(value));
	}
	assert.equal(strings, 3, "Only values needing parentheses leave the ordinary string path");
	assert.deepEqual([stringReads, metadataReads], [1, 1]);
});

test("scalar plans disable the string hook for every token-level display override", () => {
	const engine = createNumericEngine({ prepare(...args) {
		return { ...nativeDomain.prepare(...args), get string() { assert.fail("Overrides require parts"); } };
	} });
	for (const spec of [
		{ kind: "number", groupSeparator: "_" }, { kind: "number", decimalSeparator: ":" },
		{ kind: "number", zeroDisplay: "" }, { kind: "number", nanDisplay: "" },
		{ kind: "number", infinityDisplay: "" },
		{ kind: "currency", currency: "USD", currencySymbol: "" },
		{ kind: "unit", unit: "meter", unitSymbol: "" },
		{ kind: "percentage", percentageSymbol: "" },
	]) {
		const plan = engine.prepare(spec, { locale: "en-US", data: {} });
		for (const value of [0, -0, 1234.5, NaN, Infinity, -Infinity])
			assert.equal(plan.formatString(value), plan.format(value).map(part => part.value).join(""));
	}
});

test("ordinal scalar plans retain locale patterns and plural rules", () => {
	const plan = ordinalEngine.prepare({ kind: "ordinal", locale: "en-GB" }, { locale: "en-US", data: {} });
	plan.format(1); // Warm digit decoding, separate from the domain's locale preparation.
	const Locale = Intl.Locale;
	let lookups = 0;
	withProperty(Intl, "Locale", { value: new Proxy(Locale, {
		construct(target, args) { lookups++; return Reflect.construct(target, args); },
	}) }, () => {
		for (const [value, expected] of [[2, "2nd"], [3, "3rd"], [11, "11th"], [21, "21st"]])
			assert.equal(plan.formatString(value), expected);
		assert.equal(lookups, 0, "Rendered values must not repeat ordinal locale discovery");
	});
});

test("internal numeric helpers return Decimal directly and preserve signs and exactness", () => {
	for (const input of ["NaN", "-NaN", "Infinity", "-Infinity", "0", "-0", "9007199254740993.25"]) {
		const value = parseQuantity(input);
		assert.ok(value instanceof Decimal);
		assert.equal(Object.hasOwn(value, "decimal"), false);
		assert.equal(value.isNeg(), input.startsWith("-") && input !== "-NaN");
		assert.equal(normalizeNumericRange(value), value);
	}
	const value = parseQuantity("9007199254740993.25");
	assert.equal(value.shift(2).toFixed(), "900719925474099325");
	assert.equal(addQuantities(value, parseQuantity("0.01")).toFixed(), "9007199254740993.26");
	assert.equal(dividePowerOfTwo(parseQuantity("1"), 3).toFixed(), "0.125");
	assert.equal(roundQuantityToInteger(parseQuantity("-0.1"), "trunc").toValue(), "-0");
	assert.equal(value.toFixed(), "9007199254740993.25");
});

test("saturation changes identity only when the numeric range changes", () => {
	for (const [input, expected] of [["1e400", "Infinity"], ["-1e400", "-Infinity"], ["1e-400", "0"], ["-1e-400", "-0"]]) {
		const value = parseQuantity(input);
		const normalized = normalizeNumericRange(value);
		assert.notEqual(normalized, value);
		assert.equal(normalized.toValue(), expected);
		assert.equal(normalizeNumericRange(normalized), normalized);
	}
});

test("trusted detailed rendering matches external input rendering", () => {
	const context = { locale: "en-US", data: {} };
	for (const spec of [{ kind: "number" }, { kind: "bytes", byteExponent: 1 },
		{ kind: "percentage" }, { kind: "ordinal" },
		{ kind: "number", compactExponent: 3 }, { kind: "unit", unit: "meter", unitDisplay: "long" },
		{ kind: "currency", currency: "USD", currencyDisplay: "name" },
		{ kind: "number", maximumFractionDigits: 0, zeroDisplay: "—" }]) {
		const engine = { bytes: byteEngine, ordinal: ordinalEngine, percentage: percentageEngine }[spec.kind] ?? nativeEngine;
		const execution = engine.prepare(spec, context);
		for (const method of ["codec", "formatSeries", "seriesStrings", "selectSeriesSpec", "formatRange"])
			assert.equal(Object.hasOwn(execution, method), false, method);
		for (const input of ["-0", "NaN", "-Infinity", "123456789123456789.25", "-0.1", "1e400", "1e-400"]) {
			const { quantity, ...metadata } = execution.detailed(parseQuantity(input));
			assert.ok(quantity instanceof Decimal);
			assert.deepEqual({ ...metadata, roundedValue: quantity.toFixed() }, execution.detailedValue(input));
		}
	}
});

test("primitive numeric inputs preserve exact values and special signs", () => {
	for (const input of [0, -0, 0.1, -123.5, Number.MIN_VALUE, Number.MAX_VALUE,
		Number.MAX_SAFE_INTEGER, NaN, Infinity, -Infinity, 0n, -1n, 900719925474099325n, 10n ** 1000n]) {
		const source = Object.is(input, -0) ? "-0" : String(input);
		assert.equal(parseQuantity(input).toValue(), parseQuantity(source).toValue());
		assert.equal(parseQuantity(input).isNeg(), parseQuantity(source).isNeg());
	}
	let reads = 0;
	assert.equal(parseQuantity({ toValue() { reads++; return " 123.25 "; } }).toFixed(), "123.25");
	assert.equal(reads, 1);
});

test("decimal magnitude uses digit counts without rendering exponential text", () => {
	for (const coefficient of ["1", "10", "123", "12300", "1.23", "0.00123", "100.001", "9007199254740993.2500"]) {
		for (const exponent of [-100000, -1000, -324, -10, 0, 10, 308, 1000, 100000]) {
			for (const sign of ["", "-"]) {
				const value = parseQuantity(`${sign}${coefficient}e${exponent}`);
				const expected = Number(value.toExponential().split("e")[1]);
				value.toExponential = () => { throw new Error("Magnitude must not render text"); };
				assert.equal(decimalOrder(value), expected);
			}
		}
	}
	for (const input of ["0", "-0", "NaN", "Infinity", "-Infinity"])
		assert.equal(decimalOrder(parseQuantity(input)), 0);
});
