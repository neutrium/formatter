import assert from "node:assert/strict";
import { formatter } from "@neutrium/formatter";

// Check every scalar entry point against an explicit expected detailed result.
// Expected values belong in the case, rather than being derived by this helper.
export function assertScalarResult(input, spec, expected, compiled = formatter.compile(spec)) {
	const context = JSON.stringify({ input, spec }, (_key, value) =>
		typeof value === "bigint" ? `${value}n` : typeof value === "number" && !Number.isFinite(value)
			? String(value) : Object.is(value, -0) ? "-0" : value);
	for (const [method, result] of [
		["format", expected.text], ["formatToParts", expected.parts], ["formatDetailed", expected],
	]) {
		assert.deepEqual(formatter[method](input, spec), result, `direct ${method}: ${context}`);
		assert.deepEqual(compiled[method](input), result, `compiled ${method}: ${context}`);
	}
}
