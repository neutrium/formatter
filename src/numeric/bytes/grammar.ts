import { immutableSnapshot } from "../../core/immutable-snapshot.js";
import { multiplyPowerOfTwo } from "../shared/decimal-string.js";
import { numericSpecOptions } from "../shared/options.js";
import type { NumericParseGrammar } from "../shared/parse-grammar.js";
import type { BytesFormatSpec } from "./spec.js";

// Share scale-bound snapshots between discovery and verification. The engine's
// identity cache then retains at most nine derived plans per profile/context.
const SCALE_SPECS = new WeakMap<BytesFormatSpec, BytesFormatSpec[]>();
function scaleSpec(spec: BytesFormatSpec, power: number): BytesFormatSpec {
	if (spec.byteExponent !== undefined) return spec;
	let scales = SCALE_SPECS.get(spec);
	if (!scales) SCALE_SPECS.set(spec, scales = []);
	return scales[power] ??= immutableSnapshot({ ...numericSpecOptions(spec), byteExponent: power });
}

export const byteGrammar: NumericParseGrammar = {
	*probes(spec, probe)
	{
		const options = spec as BytesFormatSpec;
		const base = options.byteBase ?? 1024;

		for (let power = 0; power <= 8; power++)
		{
			if (options.byteExponent !== undefined && options.byteExponent !== power) continue;

			const threshold = BigInt(base) ** BigInt(power);
			const unitSpec = scaleSpec(options, power);
			const values = ["0", "-0", String(threshold), String(threshold * 2n), String(-threshold)];

			for (const value of values)
			{
				yield probe(value, unitSpec, power);
			}
		}
	},
	canTrim: () => true,
	restore(quantity, power, spec)
	{
		const options = spec as BytesFormatSpec;
		// Keep the suffix's scale even when rounding or series selection differs
		// from the reconstructed value's automatic unit.
		return {
			quantity: power === 0 ? quantity : (options.byteBase ?? 1024) === 1000
				? quantity.shift(power * 3) : multiplyPowerOfTwo(quantity, power * 10),
			spec: scaleSpec(options, power),
		};
	},
};
