// Run after building: node tools/benchmark-formatting.mjs
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { formatter } from "../dist/index.js";
import { Formatter, numberCodec, bytesCodec } from "../dist/extensions.js";

const rowCount = Number(process.env.FORMAT_BENCH_ROWS ?? 10000);
if (!Number.isSafeInteger(rowCount) || rowCount < 1 || rowCount > 1000000)
{
	throw new RangeError("FORMAT_BENCH_ROWS must be between 1 and 1000000");
}
const rows = Array.from({ length: rowCount }, (_, index) => String(index + 0.125));
// Copied codecs use generic token-based series dispatch; detailed rendering is now shared.
const general = new Formatter({ codecs: [{ ...numberCodec }, { ...bytesCodec }] });

function median(run)
{
	const samples = [];

	for (let sample = 0; sample < 5; sample++)
	{
		const start = performance.now();
		run();
		samples.push(performance.now() - start);
	}

	return samples.sort((a, b) => a - b)[2];
}

console.log(`Median of five warm runs, ${rowCount} rows; milliseconds (not a CI timing assertion).`);

for (const spec of [{ kind: "number", maximumFractionDigits: 2 }, { kind: "bytes" }])
{
	const fast = formatter.compile(spec);
	const fallback = general.compile(spec);

	{
		const run = compiled => compiled.formatSeries(rows);
		assert.deepEqual(run(fast), run(fallback));
		const generalMs = median(() => run(fallback));
		const optimizedMs = median(() => run(fast));

		console.log(JSON.stringify({
			operation: "series", kind: spec.kind,
			generalMs: +generalMs.toFixed(1), optimizedMs: +optimizedMs.toFixed(1),
			speedup: +(generalMs / optimizedMs).toFixed(2),
		}));
	}
}
