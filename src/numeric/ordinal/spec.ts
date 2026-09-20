import type { NumericDisplayOptions } from "../../types.js";

/**
 * Locale-aware ordinal specification.
 *
 * Built-in patterns are selected by the language subtag. Call
 * {@link diagnostics!supportsOrdinal} before offering arbitrary locales, provide custom
 * {@link ordinalPatterns}, or opt into plain-number fallback.
 *
 * @example
 * ```ts
 * import { formatter } from "@neutrium/formatter";
 *
 * formatter.format(23, { kind: "ordinal" });
 * // "23rd"
 * ```
 */
export interface OrdinalFormatSpec extends NumericDisplayOptions
{
	/** Selects the built-in ordinal codec. */
	kind: "ordinal";
	/** Locale plural-category patterns containing exactly one `{number}` placeholder. */
	ordinalPatterns?: Readonly<Partial<Record<Intl.LDMLPluralRule, string>> & {
		/** Required fallback pattern for plural categories without an explicit entry. */
		other: string;
	}>;
	/** Behavior when no built-in language pattern exists. Defaults to `error`. */
	ordinalFallback?: "error" | "number";
}
