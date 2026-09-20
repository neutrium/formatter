import test from "node:test";
import { runIsolated } from "./helpers/isolated-process.js";

test("rejects runtimes that lose decimal-string precision in text or parts", () => {
	for (const mode of ["text", "parts"]) {
		// Isolate the cached capability snapshot from other tests.
		runIsolated(`
			const Native = Intl.NumberFormat;
			Intl.NumberFormat = class extends Native {
				get format() {
					const format = super.format;
					return input => format(${JSON.stringify(mode)} === 'text' && typeof input === 'string' ? Number(input) : input);
				}
				formatToParts(input) {
					return super.formatToParts(${JSON.stringify(mode)} === 'parts' && typeof input === 'string' ? Number(input) : input);
				}
			};
			const { formatter } = await import('./dist/index.js');
			const { Formatter } = await import('./dist/extensions.js');
			const { parser } = await import('./dist/parse.js');
			const { runtimeCapabilities } = await import('@neutrium/formatter/diagnostics');
			assert.equal(runtimeCapabilities().exactDecimalStrings, false);
			const spec = { kind: 'number' };
			assert.equal(formatter.supports(spec), false);
			assert.equal(formatter.resolve(spec).error.name, 'RangeError');
			for (const run of [
				() => formatter.format('9007199254740993.25', spec),
				() => formatter.formatToParts('9007199254740993.25', spec),
				() => formatter.formatDetailed(1, spec),
				() => formatter.formatRange(1, 2, spec),
				() => formatter.formatSeries([1], spec),
				() => parser.parse('1', spec),
				() => formatter.compile(spec),
			]) assert.throws(run, /exact decimal strings/);
			Intl.DurationFormat = undefined;
			assert.throws(() => formatter.format('1.125', { kind: 'duration', presentation: 'localized', style: 'digital' }), /Intl.DurationFormat/);
			assert.equal(formatter.format(1, { kind: 'duration', presentation: 'elapsed' }), '0:00:01');
			const custom = new Formatter({ codecs: [{ kind: 'label', format: value => [{ type: 'literal', value }] }] });
			assert.equal(custom.format('hello', { kind: 'label' }), 'hello');
		`);
	}
});
