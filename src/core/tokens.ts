/** Semantic token names emitted by the built-in codecs. */
export type BuiltInFormatTokenType =
	| "sign"
	| "currency"
	| "integer"
	| "group"
	| "decimal"
	| "fraction"
	| "exponentSeparator"
	| "exponentSign"
	| "exponentInteger"
	| "unit"
	| "ordinal"
	| "years"
	| "months"
	| "weeks"
	| "days"
	| "hours"
	| "minutes"
	| "seconds"
	| "milliseconds"
	| "microseconds"
	| "nanoseconds"
	| "literal";

/** Built-in semantic names plus arbitrary domain-specific names supplied by custom codecs. */
export type FormatTokenType = BuiltInFormatTokenType | (string & {});

/**
 * Semantic fragment of formatted output.
 *
 * Consumers can style or inspect tokens without parsing the final localized text.
 */
export interface FormatToken
{
	/** Semantic role of this fragment. */
	type: FormatTokenType;
	/** Rendered text for this fragment. */
	value: string;
}

/** Origin assigned to every token in a formatted range. */
export type RangeTokenSource = "startRange" | "endRange" | "shared";

/** A semantic range fragment with its originating endpoint. */
export interface RangeFormatToken extends FormatToken
{
	/** Endpoint, or shared range syntax, that produced this fragment. */
	source: RangeTokenSource;
}

/**
 * Joins token values into their final presentation string.
 * Preserves every fragment, including whitespace and bidirectional marks.
 * Use this for a plain-text version of parts you already have, such as an email
 * summary of a styled price. For text alone, use `formatter.format()`; detailed
 * results already include their text as `result.text`.
 *
 * @param tokens - Ordered scalar or range tokens to render.
 * @returns Concatenated token values; an empty array produces an empty string.
 *
 * @example Reuse a styled price's parts in a plain-text receipt
 * ```ts
 * import { formatter, renderTokens } from "@neutrium/formatter";
 *
 * const parts = formatter.formatToParts(1234.5, { kind: "currency", currency: "USD" });
 * // The UI renders these parts as styled elements. The receipt needs plain text:
 * const receiptLine = `Total: ${renderTokens(parts)}`;
 * // "Total: $1,234.50"
 * ```
 */
export function renderTokens(tokens: readonly FormatToken[]): string
{
	return tokens.map((token) => token.value).join("");
}
