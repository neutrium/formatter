import type { RuntimeCapabilities } from "./capabilities.js";
import { supportsExactDecimalStrings, supportsNumberOption, supportsRoundingPriority } from "../numeric/shared/runtime-checks.js";


let runtimeSnapshot: RuntimeCapabilities | undefined;

/**
 * Reports the Intl features available to the installed library runtime.
 *
 * Import as `runtimeCapabilities` from `@neutrium/formatter/diagnostics`.
 * The first call probes features and caches a frozen snapshot. Load polyfills
 * before importing the library or querying capabilities. These feature flags
 * do not validate a particular locale or specification; use
 * {@link extensions!Formatter.resolve} or {@link extensions-parse!Parser.resolve} for that.
 *
 * @returns The cached, immutable feature snapshot.
 * @example Capture an Intl feature report for a support request
 * ```ts
 * import { runtimeCapabilities } from "@neutrium/formatter/diagnostics";
 *
 * const runtime = runtimeCapabilities();
 * console.log(JSON.stringify({ intl: runtime }, null, 2));
 * // Attach the report when investigating output differences between environments.
 * ```
 */
export function getRuntimeCapabilities(): RuntimeCapabilities
{
	if (runtimeSnapshot)
	{
		return runtimeSnapshot;
	}

	const NumberFormat = Intl.NumberFormat;
	const numberFormat = typeof NumberFormat === "function";
	const prototype = numberFormat ? NumberFormat.prototype as unknown as Record<string, unknown> : {};
	const IntlRecord = Intl as unknown as Record<string, unknown>;

	runtimeSnapshot = Object.freeze({
		numberFormat,
		numberFormatRange: typeof prototype.formatRange === "function" &&
			typeof prototype.formatRangeToParts === "function",
		durationFormat: typeof IntlRecord.DurationFormat === "function",
		supportedValuesOf: typeof IntlRecord.supportedValuesOf === "function",
		exactDecimalStrings: numberFormat && supportsExactDecimalStrings(),
		unitFormat: numberFormat && supportsNumberOption("style", "unit", { unit: "meter" }),
		compactNotation: numberFormat && supportsNumberOption("notation", "compact"),
		roundingMode: numberFormat && supportsNumberOption("roundingMode", "halfEven"),
		roundingIncrement: numberFormat && supportsNumberOption("roundingIncrement", 5, {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		}),
		roundingPriority: numberFormat && supportsRoundingPriority(),
		trailingZeroDisplay: numberFormat && supportsNumberOption("trailingZeroDisplay", "stripIfInteger"),
		negativeSignDisplay: numberFormat && supportsNumberOption("signDisplay", "negative"),
	});

	return runtimeSnapshot;
}
