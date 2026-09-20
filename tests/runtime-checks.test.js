import test from "node:test";
import assert from "node:assert/strict";
import { runIsolated } from "./helpers/isolated-process.js";
import { createFormatter } from "@neutrium/formatter";

test("ordinary operations do not initialize full runtime diagnostics", () => {
	runIsolated(`
		const Native = Intl.NumberFormat;
		const constructors = [];
		Intl.NumberFormat = new Proxy(Native, { construct(target, args) {
			constructors.push(args[1]);
			return Reflect.construct(target, args);
		} });
		let unrelatedReads = 0;
		for (const name of ['DurationFormat', 'supportedValuesOf']) {
			const value = Intl[name];
			Object.defineProperty(Intl, name, { configurable: true, get() { unrelatedReads++; return value; } });
		}
		const { formatter } = await import('./dist/index.js');
		const { parser } = await import('./dist/parse.js');
		const { runtimeCapabilities } = await import('./dist/diagnostics.js');
		assert.equal(constructors.length, 0);
		assert.equal(formatter.format(1, { kind: 'duration', presentation: 'elapsed' }), '0:00:01');
		assert.equal(parser.parse('0:00:01', { kind: 'duration', presentation: 'elapsed' }), '1');
		assert.equal(constructors.length, 0);
		const compiled = formatter.compile({ kind: 'number' });
		assert.deepEqual(constructors, [{ useGrouping: false }, { style: 'decimal' }]);
		assert.equal(compiled.format(1234.5), '1,234.5');
		assert.equal(formatter.supports(compiled.spec), true);
		parser.compile({ kind: 'number' });
		assert.equal(constructors.length, 3);
		assert.equal(unrelatedReads, 0);
		const report = runtimeCapabilities();
		assert.equal(unrelatedReads, 2);
		assert.ok(constructors.some(options => options.style === 'unit'));
		assert.ok(constructors.some(options => options.notation === 'compact'));
		assert.equal(report.roundingMode, true);
		assert.equal(report.exactDecimalStrings, true);
		assert.ok(Object.isFrozen(report));
		const count = constructors.length;
		assert.strictEqual(runtimeCapabilities(), report);
		assert.equal(constructors.length, count);
	`);
});

test("diagnostics and operations share lazy exact-decimal and priority probes in either order", () => {
	for (const diagnosticsFirst of [false, true]) runIsolated(`
		const Native = Intl.NumberFormat;
		let exact = 0, priority = 0;
		Intl.NumberFormat = new Proxy(Native, { construct(target, args) {
			const options = args[1];
			if (Object.keys(options).length === 1 && options.useGrouping === false) exact++;
			if (Object.keys(options).length === 1 && options.roundingPriority === 'morePrecision') priority++;
			return Reflect.construct(target, args);
		} });
		const { formatter } = await import('./dist/index.js');
		const { runtimeCapabilities } = await import('./dist/diagnostics.js');
		if (${diagnosticsFirst}) runtimeCapabilities();
		const spec = { kind: 'number', roundingPriority: 'morePrecision' };
		formatter.compile(spec);
		formatter.compile(spec);
		runtimeCapabilities();
		assert.equal(exact, 1);
		assert.equal(priority, 1);
	`);
});

test("operational resolution rejects ignored numeric features without full diagnostics", () => {
	for (const [name, value, extra] of [
		["roundingMode", "ceil"], ["roundingIncrement", 5, { maximumFractionDigits: 0 }],
		["roundingPriority", "morePrecision"], ["trailingZeroDisplay", "stripIfInteger"],
		["signDisplay", "negative"], ["notation", "compact"],
		["style", "unit", { kind: "unit", unit: "meter" }],
	]) runIsolated(`
		const Native = Intl.NumberFormat;
		const name = ${JSON.stringify(name)};
		Intl.NumberFormat = class extends Native {
			constructor(locale, options) { super(locale, { ...options, [name]: undefined }); }
		};
		const { formatter } = await import('./dist/index.js');
		const { parser } = await import('./dist/parse.js');
		const spec = { kind: 'number', [name]: ${JSON.stringify(value)}, ...${JSON.stringify(extra ?? {})} };
		if (name === 'style') delete spec.style;
		for (const instance of [formatter, parser]) {
			const result = instance.resolve(spec);
			assert.equal(result.supported, false);
			assert.match(result.error.message, new RegExp(name));
			assert.throws(() => instance.compile(spec), new RegExp(name));
		}
		assert.equal(formatter.format(1, { kind: 'number' }), '1');
	`);
});

test("operational resolution uses the requested formatter rather than unrelated probe results", () => {
	runIsolated(`
		const Native = Intl.NumberFormat;
		Intl.NumberFormat = class extends Native {
			constructor(locale, options) {
				if (options?.unit === 'meter') throw new RangeError('meter unavailable');
				super(locale, options);
			}
		};
		const { runtimeCapabilities } = await import('./dist/diagnostics.js');
		assert.equal(runtimeCapabilities().unitFormat, false);
		const { formatter } = await import('./dist/index.js');
		const spec = { kind: 'unit', unit: 'kilometer' };
		assert.equal(formatter.supports(spec), true);
		assert.equal(formatter.format(1, spec), '1 km');
	`);
});

test("priority checks preserve native precision normalization", () => {
	const formatter = createFormatter();
	for (const roundingPriority of ["auto", "morePrecision", "lessPrecision"]) {
		for (const notation of ["standard", "compact"]) {
			for (const precision of [{}, { minimumFractionDigits: 1, maximumFractionDigits: 3,
				minimumSignificantDigits: 2, maximumSignificantDigits: 4 }]) {
				const options = { notation, roundingPriority, roundingMode: "halfEven", ...precision };
				const compiled = formatter.compile({ kind: "number", ...options });
				const native = new Intl.NumberFormat("en-US", options);
				assert.deepEqual(compiled.resolution.intl.resolvedOptions, native.resolvedOptions());
				assert.equal(compiled.format(1234.567), native.format(1234.567));
			}
		}
	}
});
