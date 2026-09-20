import { FormatContext } from "../core/codec.js";
import { UnsupportedParseError } from "../core/errors.js";
import { renderTokens } from "../core/tokens.js";
import { parseQuantity } from "../numeric/shared/decimal-string.js";
import { formatElapsedQuantity } from "./elapsed.js";
import { normalizeDurationSpec } from "./options.js";
import { DurationFormatSpec, ElapsedDurationFormatSpec } from "./spec.js";

export function prepareDurationParser(spec: DurationFormatSpec, context: FormatContext)
{
	const options = normalizeDurationSpec(spec);

	if (options.presentation === "localized")
	{
		throw new UnsupportedParseError("duration", "localized presentation");
	}

	const locale = Intl.getCanonicalLocales(options.locale || context.locale)[0];

	return {
		parse: (input: string) => parseElapsed(input, options),
		resolve: () => ({ locale, implementation: "wrapper" as const }),
	};
}

function parseElapsed(input: string, spec: ElapsedDurationFormatSpec): string
{
	const source = input.trim();
	const match = /^(\()?([+-]?)(\d+):(\d{2}):(\d{2})(\))?$/.exec(source);

	// Ordinary elapsed syntax cannot be a special value. Keep its hot path to
	// the single canonical render below, without adding another sign grammar.
	if (!match)
	{
		for (const special of ["NaN", "Infinity", "-Infinity"])
		{
			if (renderTokens(formatElapsedQuantity(parseQuantity(special), spec)) === source)
			{
				return special;
			}
		}
	}

	if (
		!match || Boolean(match[1]) !== Boolean(match[6]) ||
		Number(match[4]) > 59 ||
		Number(match[5]) > 59
	){
		throw new TypeError(`Invalid formatted duration: ${input}`);
	}

	const seconds = BigInt(match[3]) * 3600n + BigInt(match[4]) * 60n + BigInt(match[5]);
	const negative = match[1] === "(" || match[2] === "-";
	let quantity = parseQuantity(seconds);

	if (negative)
	{
		quantity = quantity.neg();
	}

	if (spec.inputUnit === "milliseconds")
	{
		quantity = quantity.shift(3);
	}

	if (renderTokens(formatElapsedQuantity(quantity, spec)) !== source)
	{
		throw new TypeError(`Invalid formatted duration: ${input}`);
	}

	return quantity.toFixed();
}
