import { CodecFormatResolution } from "../../core/codec.js";
import type { numberFormatOptions } from "./options.js";
import { NumericFormatSpec } from "../specs.js";
import { supportsRoundingPriority } from "./runtime-checks.js";

export function resolveNumericFormat(
	spec: NumericFormatSpec,
	formatter: Intl.NumberFormat,
	options: ReturnType<typeof numberFormatOptions>
): CodecFormatResolution
{
	const requestedOptions = options as Readonly<Record<string, unknown>>;
	const resolvedOptions = formatter.resolvedOptions() as unknown as Readonly<Record<string, unknown>>;

	// Check the actual prepared service, without constructing unrelated diagnostic
	// formatters. Intl owns value validation; this catches silently ignored options.
	for (const name of ["roundingMode", "roundingIncrement", "roundingPriority", "trailingZeroDisplay", "signDisplay", "style", "notation"])
	{
		const requested = requestedOptions[name];
		const resolved = resolvedOptions[name];

		// Priority can be normalized by Intl (including compact defaults), so it
		// needs a targeted, cached probe only when explicitly requested.
		if (requested !== undefined && (name === "roundingPriority" ? !supportsRoundingPriority() : requested !== resolved))
		{
			throw new RangeError(`The current Intl runtime does not support ${name}: ${requested}`);
		}
	}

	const fixedCompact = (spec.kind === "number" || spec.kind === "currency" || spec.kind === "unit") &&
		spec.compactExponent !== undefined;
	const nativeDomain = spec.kind === "number" || spec.kind === "currency" ||
		spec.kind === "percentage" || spec.kind === "unit";
	const nativeAvailable = typeof (formatter as unknown as { formatRangeToParts?: unknown }).formatRangeToParts === "function";
	const valueDependentFallback = spec.negativeDisplay === "parentheses" ||
		spec.nanDisplay !== undefined || spec.infinityDisplay !== undefined;
	const rangeImplementation = !nativeDomain || fixedCompact || !nativeAvailable || spec.zeroDisplay !== undefined
		? "fallback"
		: valueDependentFallback
			? "conditional"
			: "native";
	const implementation = spec.kind === "bytes" || spec.kind === "ordinal" || fixedCompact
		? "wrapper"
		: "intl-number-format";

	return {
		locale: resolvedOptions.locale as string,
		implementation,
		rangeImplementation,
		intl: {
			service: "NumberFormat",
			requestedOptions,
			resolvedOptions,
		},
	};
}
