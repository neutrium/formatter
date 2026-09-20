import { LruCache } from "../../core/cache.js";

export interface DigitToken { readonly source: string; readonly output: string }
const DIGITS = new LruCache<string, readonly DigitToken[]>(128);

/** Locale digits shared by strict parsing and trusted-part metadata extraction. */
export function digitTokens(locale: string, numberingSystem?: string): readonly DigitToken[]
{
	const key = JSON.stringify([locale, numberingSystem]);
	let digits = DIGITS.get(key);

	if (!digits)
	{
		const formatter = new Intl.NumberFormat(locale, { useGrouping: false, numberingSystem, maximumFractionDigits: 0 });
		digits = Array.from({ length: 10 }, (_, value) => ({
			source: formatter.formatToParts(value).filter(part => part.type === "integer").map(part => part.value).join(""),
			output: String(value),
		})).sort((left, right) => right.source.length - left.source.length);
		DIGITS.set(key, digits);
	}

	return digits;
}

export function decodeDigits(source: string, digits: readonly DigitToken[]): string
{
	let output = "";

	for (let index = 0; index < source.length;)
	{
		const digit = digits.find(token => source.startsWith(token.source, index));

		if (!digit)
		{
			throw new TypeError(`Invalid localized digit: ${source}`);
		}

		output += digit.output;
		index += digit.source.length;
	}
	return output;
}
