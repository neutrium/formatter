import type { FormatToken } from "../core/tokens.js";
import type { DurationFormatSpec } from "./spec.js";

const asciiSign = (negative: boolean): FormatToken[] => [{ type: "sign", value: negative ? "-" : "+" }];

/** Shared sign policy; localized glyph lookup stays in the localized renderer. */
export function durationSigns(
	negative: boolean,
	zero: boolean,
	spec: DurationFormatSpec,
	sign: (negative: boolean) => FormatToken[] = asciiSign,
): { prefix: FormatToken[]; suffix: FormatToken[]; negative: boolean }
{
	const display = spec.signDisplay ?? "auto";
	const defaultReturn = { prefix: [], suffix: [], negative: false };

	if (display === "never")
	{
		return defaultReturn
	}

	if (negative && !((display === "negative" || display === "exceptZero") && zero))
	{

		if(spec.negativeDisplay === "parentheses")
		{
			return {
				prefix: [{ type: "sign", value: "(" }],
				suffix: [{ type: "sign", value: ")" }],
				negative: true
			};
		}
		else
		{
			return {
				prefix: sign(true),
				suffix: [],
				negative: true,
			}
		}
	}

	if ((!negative && display === "always") || (!zero && !negative && display === "exceptZero"))
	{
		return {
			prefix: sign(false),
			suffix: [],
			negative: false,
		};
	}

	return defaultReturn;
}
