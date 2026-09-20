import { performance } from "node:perf_hooks";
import { createParser } from "../dist/parse.js";
import { formatter } from "../dist/index.js";

// Run after building: node tools/benchmark-parsing.mjs
// Fresh parser contexts keep profile/Intl caches cold; CLDR/runtime startup is warmed.
const cases = [
	["number", { kind: "number" }, 1234.5],
	["compact", { kind: "number", notation: "compact" }, 1234],
	["Arabic unit", { kind: "unit", unit: "meter", notation: "compact", locale: "ar" }, 1234],
	["Russian currency", { kind: "currency", currency: "USD", currencyDisplay: "name", notation: "compact", compactDisplay: "long", maximumFractionDigits: 1, locale: "ru" }, 9999.9],
	["Latvian zero", { kind: "number", locale: "lv", notation: "compact", compactDisplay: "long", maximumFractionDigits: 0, roundingIncrement: 25, roundingMode: "ceil" }, -1000],
];
const presentations = cases.flatMap(([name, spec, value]) => [
	[name, spec, value, false], [name + " (padded)", spec, value, true],
]);

for (const [name, spec, value, padded] of presentations)
{
	const text = formatter.format(value, spec);
	const input = padded ? ` \t${text}\n` : text;
	const durations = [];
	let partsCalls = 0;

	for (let sample = 0; sample < 25; sample++)
	{
		const parser = createParser();
		const original = Intl.NumberFormat.prototype.formatToParts;
		partsCalls = 0;
		Intl.NumberFormat.prototype.formatToParts = function (...args) {
			partsCalls++;
			return original.apply(this, args);
		};

		try
		{
			const start = performance.now();
			parser.parse(input, spec);

			if (sample >= 5)
			{
				durations.push(performance.now() - start);
			}
		}
		finally
		{
			Intl.NumberFormat.prototype.formatToParts = original;
		}
	}

	durations.sort((a, b) => a - b);
	const compiled = createParser().compile(spec);
	compiled.parse(input);
	const start = performance.now();

	for (let index = 0; index < 5000; index++)
	{
		compiled.parse(input);
	}

	console.log(JSON.stringify({
		name,
		input,
		coldMedianMs: durations[Math.floor(durations.length / 2)],
		coldPartsCalls: partsCalls,
		warmMicrosecondsPerParse: (performance.now() - start) / 5
	}));
}
