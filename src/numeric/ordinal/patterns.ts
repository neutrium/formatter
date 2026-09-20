import { UnsupportedOrdinalLocaleError } from "../../core/errors.js";
import { LruCache } from "../../core/cache.js";

type OrdinalPatterns = Readonly<Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }>;

const FIXED: Readonly<Record<string, string>> = Object.freeze({
	de: "{number}.", cs: "{number}.", da: "{number}.", fi: "{number}.", nb: "{number}.",
	nn: "{number}.", pl: "{number}.", sk: "{number}.", tr: "{number}.", hu: "{number}.",
	et: "{number}.", hr: "{number}.", is: "{number}.", sl: "{number}.", sr: "{number}.",
	es: "{number}.º", pt: "{number}.º", it: "{number}º", nl: "{number}e",
	ja: "第{number}", zh: "第{number}", ko: "제{number}",
	id: "ke-{number}", ms: "ke-{number}", th: "ที่ {number}", vi: "thứ {number}",
});

const CATEGORY: Readonly<Record<string, OrdinalPatterns>> = Object.freeze({
	en: Object.freeze({ one: "{number}st", two: "{number}nd", few: "{number}rd", other: "{number}th" }),
	fr: Object.freeze({ one: "{number}er", other: "{number}e" }),
	sv: Object.freeze({ one: "{number}:a", other: "{number}:e" }),
});
const PLURAL_RULES = new LruCache<string, Intl.PluralRules>(64);

/**
 * Frozen, alphabetically sorted language codes with built-in ordinal patterns.
 * Region and numbering-system subtags are intentionally omitted because lookup is
 * based on the locale's language subtag.
 */
export const supportedOrdinalLocales: readonly string[] = Object.freeze([
	...Object.keys(CATEGORY),
	...Object.keys(FIXED),
].sort());

/**
 * Returns whether a locale's language has a built-in ordinal pattern.
 *
 * @example
 * ```ts
 * import { supportsOrdinal } from "@neutrium/formatter/diagnostics";
 *
 * supportsOrdinal("en-AU"); // true
 * supportsOrdinal("ar-EG"); // false
 * ```
 *
 * @throws `RangeError` when `locale` is not a structurally valid locale identifier.
 */
export function supportsOrdinal(locale: string): boolean
{
	const language = new Intl.Locale(locale).language;

	return language in CATEGORY || language in FIXED;
}

function pluralInput(integer: string): number
{
	const digits = integer.replace(/^[-+]/, "").replace(/^0+/, "") || "0";

	if (digits.length <= 15)
	{
		return Number(digits);
	}

	return 1_000_000_000_000_000 + Number(digits.slice(-15));
}

function pluralRules(locale: string): Intl.PluralRules
{
	let rules = PLURAL_RULES.get(locale);

	if (!rules)
	{
		rules = new Intl.PluralRules(locale, { type: "ordinal" });
		PLURAL_RULES.set(locale, rules);
	}

	return rules;
}

/** Resolve normalized ordinal syntax without selecting a sample value's category. */
function resolveOrdinalPatterns(
	locale: string,
	override?: OrdinalPatterns,
	fallback: "error" | "number" = "error",
): string | OrdinalPatterns
{
	const language = new Intl.Locale(locale).language;

	if (override)
	{
		return override;
	}

	const categoryPatterns = CATEGORY[language];

	if (categoryPatterns)
	{
		return categoryPatterns;
	}

	const fixed = FIXED[language];

	if (fixed)
	{
		return fixed;
	}

	if (fallback === "number")
	{
		return "{number}";
	}

	throw new UnsupportedOrdinalLocaleError(locale);
}

export function prepareOrdinalPattern(
	locale: string,
	override?: OrdinalPatterns,
	fallback: "error" | "number" = "error",
): (integer: string) => string
{
	const patterns = resolveOrdinalPatterns(locale, override, fallback);

	if (typeof patterns === "string")
	{
		return () => patterns;
	}

	const rules = pluralRules(locale);

	return integer => patterns[rules.select(pluralInput(integer))] ?? patterns.other;
}
