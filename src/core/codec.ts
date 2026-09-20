import { FormatToken, RangeFormatToken } from "./tokens.js";
import { SeriesFormatOptions } from "./series.js";
import { FormatImplementation, FormatValueMetadata, IntlFormatMetadata, RangeImplementation } from "./capabilities.js";

/** Base shape shared by every formatter specification. */
export interface FormatSpecBase
{
	/** Literal discriminator used to select a registered codec. */
	readonly kind: string;
	/** BCP 47 locale overriding the formatter's default for this operation. */
	readonly locale?: string;
}

/** Immutable formatter state supplied to codec operations. */
export interface FormatContext
{
	/** Canonicalized default BCP 47 locale. */
	readonly locale: string;
	/** Frozen, shallow copy of the application data supplied when the formatter was created. */
	readonly data: Readonly<Record<string, unknown>>;
}

/**
 * Optional codec-provided details used by {@link extensions!Formatter.resolve}.
 *
 * Parsing support is inferred from the parser codec;
 * omitted range strategy is inferred from {@link FormatCodec.formatRange}.
 */
export interface CodecFormatResolution
{
	/** Effective canonical locale, when the codec resolves one. */
	readonly locale?: string;
	/** Implementation responsible for presentation. Defaults to `custom`. */
	readonly implementation?: FormatImplementation;
	/** Whether this particular specification can be parsed. */
	readonly parse?: boolean;
	/** Range strategy for this particular specification. */
	readonly rangeImplementation?: RangeImplementation;
	/** Intl service and options used by the codec, when applicable. */
	readonly intl?: IntlFormatMetadata;
}

/**
 * Codec for one discriminated value domain.
 *
 * `format` is the only required operation. Range formatting,
 * series-specific scaling, runtime resolution, and a direct string fast path are
 * opt-in capabilities. Define codec objects with `satisfies FormatCodec<...>` so
 * TypeScript checks the implementation without erasing which optional methods
 * are actually present.
 *
 * @typeParam Kind - Literal value of `Options["kind"]`.
 * @typeParam Value - Value accepted by formatting operations.
 * @typeParam Options - Specification accepted by the codec.
 * @typeParam Rounded - Value reported as rounded metadata by `formatDetailed`.
 *
 * @example A point formatting codec
 * ```ts
 * import { createFormatter } from "@neutrium/formatter";
 * import type { FormatCodec, FormatSpecBase } from "@neutrium/formatter/extensions";
 *
 * interface Point { x: number; y: number }
 * interface PointSpec extends FormatSpecBase {
 *   kind: "point";
 *   separator?: string;
 * }
 *
 * const pointCodec = {
 *   kind: "point",
 *   format(point, spec) {
 *     return [{
 *       type: "literal",
 *       value: `${point.x}${spec.separator ?? ","}${point.y}`,
 *     }];
 *   },
 * } satisfies FormatCodec<"point", Point, PointSpec, Point>;
 *
 * const custom = createFormatter({ codecs: [pointCodec] });
 * custom.format({ x: 10, y: 20 }, { kind: "point", separator: ":" });
 * // "10:20"
 * ```
 */
export interface FormatCodec<
	Kind extends string = string,
	Value = unknown,
	Options extends FormatSpecBase = FormatSpecBase,
	Rounded = Value,
> {
	/** Unique literal discriminator handled by this codec. */
	readonly kind: Kind;

	/** Formats a value into semantic tokens; this is the required rendering operation. */
	format(value: Value, options: Options, context: FormatContext): readonly FormatToken[];
	/**
	 * Optional direct string fast path used by `format` and compiled `format`.
	 * Its output should equal `renderTokens(codec.format(...))`.
	 */
	formatString?(value: Value, options: Options, context: FormatContext): string;
	/** Optional series renderer for domain-specific shared-scale selection. */
	formatSeries?(
		values: readonly Value[],
		options: Options,
		context: FormatContext,
		seriesOptions: SeriesFormatOptions,
	): readonly (readonly FormatToken[])[];
	/**
	 * Selects reusable series options for `Formatter.compileSeries` without rendering.
	 * The returned specification must retain the same kind and encode the selected
	 * scale for scalar, collection, and parsing operations. Input options are frozen;
	 * return a new record when changing them. Without this hook, options are unchanged.
	 */
	selectSeriesSpec?(values: readonly Value[], options: Options, context: FormatContext): Options;
	/** Optional range renderer producing source-labelled tokens. */
	formatRange?(start: Value, end: Value, options: Options, context: FormatContext): readonly RangeFormatToken[];
	/** Optional resolver for specification-dependent support and implementation metadata. */
	resolve?(options: Options, context: FormatContext): CodecFormatResolution;
	/** Optional detailed renderer; computes metadata while rendering, without localized parsing. */
	formatDetailed?(value: Value, options: Options, context: FormatContext): FormatValueMetadata<Rounded> & {
		/** Semantic fragments used to derive the final formatted text. */
		parts: readonly FormatToken[];
	};
}

/** Type-erased codec used internally by heterogeneous codec registries. */
export type AnyFormatCodec = FormatCodec<string, any, any, any>;
