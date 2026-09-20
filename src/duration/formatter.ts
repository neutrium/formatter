import type { CodecFormatResolution, FormatCodec, FormatContext } from "../core/codec.js";
import { renderTokens } from "../core/tokens.js";
import type { DurationFormatSpec, DurationValue } from "./spec.js";
import { normalizeDurationSpec } from "./options.js";
import { formatElapsedDuration, formatElapsedDurationDetailed } from "./elapsed.js";
import { prepareLocalizedDuration } from "./localized.js";

/** One captured specification drives resolution, scalar rendering and collections. */
export function prepareDuration(spec: DurationFormatSpec, context: FormatContext)
{
	spec = normalizeDurationSpec(spec);
	const locale = Intl.getCanonicalLocales(spec.locale || context.locale)[0];
	const localized = spec.presentation === "localized" ? prepareLocalizedDuration(spec, locale) : undefined;
	const format = localized?.format ?? ((value: DurationValue) => formatElapsedDuration(value, spec));
	const formatString = localized?.formatString ?? ((value: DurationValue) => renderTokens(format(value)));
	const resolution: CodecFormatResolution = {
		locale,
		implementation: localized ? "intl-duration-format" : "wrapper",
		rangeImplementation: "unsupported",
		...(localized ? { intl: localized.intl } : {}),
	};
	const codec = {
		kind: "duration",
		format,
		formatString,
		formatDetailed: localized
			? (value: DurationValue) => ({
				/** Semantic fragments of the localized duration text. */
				parts: format(value),
			})
			: (value: DurationValue) => formatElapsedDurationDetailed(value, spec),
		resolve: () => resolution,
	} satisfies FormatCodec<"duration", DurationValue, DurationFormatSpec, string>;

	return {
		codec,
		seriesStrings: (values: readonly DurationValue[]) => values.map(formatString)
	};
}
