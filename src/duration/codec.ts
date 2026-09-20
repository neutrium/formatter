import type { FormatCodec } from "../core/codec.js";
import { registerCodecPreparation } from "../core/codec-preparation.js";
import { prepareDuration } from "./formatter.js";
import type { DurationFormatSpec, DurationValue, ElapsedDurationFormatSpec, LocalizedDurationFormatSpec } from "./spec.js";
import type { NumericValue } from "../types.js";
import type { ContractCodec, FormatContract } from "../core/FormatterTypes.js";

function createDurationCodec()
{
	// Keep the concrete shape: durations cannot change series specs or format ranges.
	const codec = {
		/** Discriminator for elapsed or localized duration specifications. */
		kind: "duration",
		/** Renders elapsed scalars or localized scalars/records into tokens. */
		format: (value, spec, context) => prepareDuration(spec, context).codec.format(value),
		/** Renders duration text directly. */
		formatString: (value, spec, context) => prepareDuration(spec, context).codec.formatString(value),
		/** Reports rounded scalar metadata for elapsed presentation only. */
		formatDetailed: (value, spec, context) => prepareDuration(spec, context).codec.formatDetailed(value),
		/** Validates and resolves the same bound options used for rendering. */
		resolve: (spec, context) => prepareDuration(spec, context).codec.resolve(),
	} satisfies FormatCodec<"duration", DurationValue, DurationFormatSpec, string>;

	registerCodecPreparation(codec, prepareDuration);

	return Object.freeze(codec);
}

/**
 * Built-in duration codec with specification-dependent contracts.
 * Elapsed `H:MM:SS` presentation reports rounded values; localized presentation
 * accepts records. Neither supports ranges or changes series scales.
 */
export const durationCodec: ReturnType<typeof createDurationCodec> & ContractCodec<readonly [
	FormatContract<ElapsedDurationFormatSpec, NumericValue, string, false>,
	FormatContract<LocalizedDurationFormatSpec, DurationValue, never, false>,
]> = /* @__PURE__ */ createDurationCodec();
