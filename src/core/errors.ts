/**
 * No codec is registered for the requested kind on this formatter or parser.
 * Factories include built-ins; directly constructed registries include only the
 * supplied codecs. Register the missing codec with `withCodec` or use a factory.
 */
export class UnknownFormatError extends Error
{
	constructor(kind: string)
	{
		super(`No formatter codec is registered for kind: ${kind}`);
		this.name = "UnknownFormatError";
	}
}

/**
 * The selected codec or presentation cannot format ranges.
 * Check a formatter's `resolve(spec).capabilities.range` before offering a range
 * operation. Built-in duration presentations do not support ranges.
 */
export class UnsupportedRangeError extends Error
{
	constructor(kind: string)
	{
		super(`Format kind '${kind}' does not support ranges`);
		this.name = "UnsupportedRangeError";
	}
}

/**
 * The selected presentation cannot parse formatted text.
 * Use a parser's `supports(spec)` or `resolve(spec)` to inspect support.
 * Localized durations are unsupported; use `presentation: "elapsed"` for reversible scalar text.
 * This error describes an unsupported operation, not a malformed input string.
 */
export class UnsupportedParseError extends Error
{
	constructor(kind: string, presentation?: string)
	{
		super(`Format kind '${kind}' does not support parsing${presentation ? ` for ${presentation}` : ""}`);
		this.name = "UnsupportedParseError";
	}
}

/**
 * No ordinal pattern is available for the requested locale's language.
 * Supply `ordinalPatterns`, choose `ordinalFallback: "number"`, or check
 * {@link diagnostics!supportsOrdinal} before offering a locale. Extends `RangeError`.
 */
export class UnsupportedOrdinalLocaleError extends RangeError
{
	constructor(locale: string)
	{
		super(`Ordinal presentation is not available for locale '${locale}'; provide ordinalPatterns or ordinalFallback`);
		this.name = "UnsupportedOrdinalLocaleError";
	}
}

/**
 * Two codecs use the same kind in one formatter or parser registry.
 * Registration does not replace an existing codec. To substitute a built-in,
 * construct an isolated registry with exactly the desired codecs.
 */
export class DuplicateFormatError extends Error
{
	constructor(kind: string)
	{
		super(`A formatter codec is already registered for kind: ${kind}`);
		this.name = "DuplicateFormatError";
	}
}
