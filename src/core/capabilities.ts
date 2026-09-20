import { FormatToken } from "./tokens.js";

/**
 * Rendering implementation selected for a resolved format specification.
 *
 * - `intl-number-format` and `intl-duration-format` use the corresponding native Intl service.
 * - `wrapper` implements a built-in domain outside Intl, such as bytes or ordinals.
 * - `custom` is the default for application codecs.
 */
export type FormatImplementation =
	| "intl-number-format"
	| "intl-duration-format"
	| "wrapper"
	| "custom";

/**
 * Range strategy selected for a resolved specification.
 *
 * `conditional` means native Intl ranges are normally used, but particular
 * values or presentation overrides may require the wrapper fallback.
 */
export type RangeImplementation = "native" | "conditional" | "fallback" | "custom" | "unsupported";

/**
 * Immutable, process-wide snapshot of Intl features used by the package.
 * Obtain it through `runtimeCapabilities()` from `@neutrium/formatter/diagnostics`.
 */
export interface RuntimeCapabilities
{
	/** Whether `Intl.NumberFormat` is available. */
	readonly numberFormat: boolean;
	/** Whether `Intl.NumberFormat` implements both range methods. */
	readonly numberFormatRange: boolean;
	/** Whether native `Intl.DurationFormat` is available. */
	readonly durationFormat: boolean;
	/** Whether `Intl.supportedValuesOf` is available. */
	readonly supportedValuesOf: boolean;
	/** Whether `Intl.NumberFormat` preserves exact integer and fractional decimal strings. */
	readonly exactDecimalStrings: boolean;
	/** Whether `Intl.NumberFormat` supports measurement-unit presentation. */
	readonly unitFormat: boolean;
	/** Whether `Intl.NumberFormat` supports compact notation. */
	readonly compactNotation: boolean;
	/** Whether `Intl.NumberFormat` honors the `roundingMode` option. */
	readonly roundingMode: boolean;
	/** Whether `Intl.NumberFormat` honors the `roundingIncrement` option. */
	readonly roundingIncrement: boolean;
	/** Whether `Intl.NumberFormat` honors the `roundingPriority` option. */
	readonly roundingPriority: boolean;
	/** Whether `Intl.NumberFormat` honors the `trailingZeroDisplay` option. */
	readonly trailingZeroDisplay: boolean;
	/** Whether `Intl.NumberFormat` supports `signDisplay: "negative"`. */
	readonly negativeSignDisplay: boolean;
}

/**
 * Operations available for one specification on the instance that resolved it.
 * Formatter resolutions always have `parse: false`; parser resolutions always
 * have rendering, series, column, and range capabilities set to false.
 */
export interface FormatCapabilities
{
	/** Whether scalar formatting is available. */
	readonly format: boolean;
	/** Whether semantic-parts formatting is available. */
	readonly formatToParts: boolean;
	/** Whether strict parsing is available for this specification. */
	readonly parse: boolean;
	/** Whether series formatting is available. */
	readonly series: boolean;
	/** Whether aligned-column formatting is available. */
	readonly columns: boolean;
	/** Whether range formatting is available. */
	readonly range: boolean;
	/** Strategy used for range formatting, or `unsupported`. */
	readonly rangeImplementation: RangeImplementation;
}

/** Requested and effective options for the Intl service backing a specification. */
export interface IntlFormatMetadata
{
	/** Intl constructor used for the presentation. */
	readonly service: "NumberFormat" | "DurationFormat";
	/** Defined options passed to the Intl constructor. */
	readonly requestedOptions: Readonly<Record<string, unknown>>;
	/** Defaults and normalized values returned by `resolvedOptions()`. */
	readonly resolvedOptions: Readonly<Record<string, unknown>>;
}

/** Serializable error returned when a specification cannot be resolved. */
export interface FormatResolutionError
{
	/** JavaScript error name, such as `RangeError` or `UnknownFormatError`. */
	readonly name: string;
	/** Human-readable failure message. */
	readonly message: string;
}

/** Metadata for a format specification supported by the current runtime. */
export interface SupportedResolvedFormat
{
	/** Resolved codec discriminator. */
	readonly kind: string;
	/** Effective canonical BCP 47 locale. */
	readonly locale: string;
	/** Discriminant indicating successful resolution. */
	readonly supported: true;
	/** Rendering implementation selected for the specification. */
	readonly implementation: FormatImplementation;
	/** Operations and range strategy available for the specification. */
	readonly capabilities: FormatCapabilities;
	/** Intl constructor metadata when an Intl service backs the presentation. */
	readonly intl?: IntlFormatMetadata;
	/** Absent on a successful resolution. */
	readonly error?: never;
}

/** Metadata for a format specification rejected by the current runtime. */
export interface UnsupportedResolvedFormat
{
	/** Requested codec discriminator, or an empty string when none was provided. */
	readonly kind: string;
	/** Effective locale when resolution progressed far enough to determine it. */
	readonly locale?: string;
	/** Discriminant indicating failed resolution. */
	readonly supported: false;
	/** No rendering implementation is available. */
	readonly implementation: null;
	/** All operations are reported as unavailable. */
	readonly capabilities: FormatCapabilities;
	/** Absent on an unsupported resolution. */
	readonly intl?: never;
	/** Serializable reason the specification could not be resolved. */
	readonly error: FormatResolutionError;
}

/**
 * Result of checking a specification with a formatter or parser's `resolve` method.
 * Check `supported` before accessing success-only metadata or the failure's `error`.
 *
 * @example Report a configuration problem before attempting to format
 * ```ts
 * import { formatter } from "@neutrium/formatter";
 *
 * const spec = { kind: "currency", currency: "USD" } as const;
 * const result = formatter.resolve(spec);
 *
 * if (result.supported)
 * {
 *     console.log(formatter.format("1234.5", spec)); // "$1,234.50"
 * }
 * else
 * {
 *     console.error(result.error.message);
 * }
 * ```
 */
export type ResolvedFormat = SupportedResolvedFormat | UnsupportedResolvedFormat;

/**
 * Decimal or binary magnitude selected for a formatted value.
 *
 * Decimal exponents are powers of ten, while binary exponents are powers of two.
 * For example, compact millions use `{ kind: "decimal", exponent: 6 }` and MiB
 * uses `{ kind: "binary", exponent: 20 }`.
 */
export type FormatScale =
	| {
		/** Decimal, power-of-ten scale. */
		readonly kind: "decimal";
		/** Power-of-ten exponent applied by the presentation. */
		readonly exponent: number;
	}
	| {
		/** Binary, power-of-two scale. */
		readonly kind: "binary";
		/** Power-of-two exponent applied by the presentation. */
		readonly exponent: number;
	};

/** Exact value and scale recoverable from a formatted presentation. */
export interface FormatValueMetadata<Rounded = unknown>
{
	/** Recoverable domain value. Built-ins use canonical strings; custom codecs may supply other types. */
	readonly roundedValue?: Rounded;
	/** Compact or byte magnitude selected for the presentation. */
	readonly scale?: FormatScale;
}

/**
 * Formatted presentation together with semantic tokens and resolution metadata.
 * Built-in localized-duration output omits `roundedValue`. Custom codecs may
 * provide typed value metadata independently of parsing support.
 */
export interface DetailedFormatResult<Rounded = unknown> extends FormatValueMetadata<Rounded>
{
	/** Final rendered text. */
	readonly text: string;
	/** Stable semantic fragments that render to {@link text}. */
	readonly parts: readonly FormatToken[];
	/** Successful resolution; unsupported specifications throw before a detailed result is returned. */
	readonly resolution: Extract<ResolvedFormat, { supported: true }>;
}


export function unsupportedCapabilities(): FormatCapabilities
{
	return Object.freeze({
		format: false,
		formatToParts: false,
		parse: false,
		series: false,
		columns: false,
		range: false,
		rangeImplementation: "unsupported",
	});
}
