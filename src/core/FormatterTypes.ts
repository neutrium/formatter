import type { AnyFormatCodec, FormatSpecBase } from "./codec.js";
import type { CompiledFormatter, RangeCompiledFormatter } from "./CompiledFormatter.js";
import type { FormatValueMetadata } from "./capabilities.js";

/**
 * Type-level description of one presentation handled by a codec.
 *
 * Contracts are needed only when a codec accepts multiple specification shapes
 * with different value types or capabilities. The first contract whose
 * {@link spec} matches the supplied specification is selected.
 *
 * @typeParam Spec - Specification shape that selects this presentation.
 * @typeParam Value - Value accepted by formatting operations.
 * @typeParam Rounded - Value reported as rounded metadata.
 * @typeParam Range - Whether range formatting is always, never, or conditionally available.
 * @property spec - Specification shape selecting this contract.
 * @property value - Input value accepted by formatting operations.
 * @property rounded - Rounded metadata returned by detailed formatting.
 * @property range - `true`, `false`, or `boolean` for runtime-dependent range support.
 */
export interface FormatContract<Spec extends FormatSpecBase = FormatSpecBase, Value = unknown, Rounded = unknown,
	Range extends boolean = boolean>
{
	spec: Spec;
	value: Value;
	rounded: Rounded;
	range: Range;
}

/** Type-only metadata for codecs with specification-dependent capabilities. */
declare const formatContracts: unique symbol;

/**
 * Associates ordered {@link FormatContract} entries with a codec.
 *
 * This interface contributes type information only; the codec's methods and
 * {@link FormatCodec.resolve} result must implement the declared behavior. The
 * first matching specification wins, so place narrower contracts first.
 *
 * @example Describe a codec whose compact presentation omits rounded metadata
 * ```ts
 * import type {
 *   ContractCodec,
 *   FormatCodec,
 *   FormatContract,
 *   FormatSpecBase,
 * } from "@neutrium/formatter/extensions";
 *
 * interface LabelSpec extends FormatSpecBase {
 *   kind: "label";
 *   compact?: boolean;
 * }
 *
 * type LabelContracts = readonly [
 *   FormatContract<LabelSpec & { compact: true }, string, never, false>,
 *   FormatContract<LabelSpec, string, string, false>,
 * ];
 *
 * declare const labelCodec:
 *   FormatCodec<"label", string, LabelSpec, string> &
 *   ContractCodec<LabelContracts>;
 * ```
 */
export interface ContractCodec<Contracts extends readonly FormatContract[]>
{
	/** Type-only ordered contract metadata; no runtime property is required. */
	readonly [formatContracts]?: Contracts;
}

/** Maps each codec's `kind` literal to that codec type. */
export type CodecMap<Codecs extends readonly AnyFormatCodec[]> = {
	[Codec in Codecs[number] as Codec["kind"]]: Codec;
};

/** @inline */
type RangeCapability<Codec> = "formatRange" extends keyof Codec
	? Codec extends { formatRange: (...args: any[]) => any }
		? "resolve" extends keyof Codec ? boolean : true
		: boolean
	: false;

/** @inline */
type CodecSpec<Codec extends AnyFormatCodec, Spec = NonNullable<Parameters<Codec["format"]>[1]>> =
	[Spec] extends [never] ? FormatSpecBase : Spec extends FormatSpecBase ? Spec : FormatSpecBase;

/** @inline */
type CodecRounded<Codec> = Codec extends { formatDetailed: (...args: any[]) => FormatValueMetadata<infer Rounded> } ? Rounded : never;

/** @inline */
type Contracts<Codec extends AnyFormatCodec> = typeof formatContracts extends keyof Codec
	? Codec extends ContractCodec<infer Presentations> ? Presentations : never
	: readonly [FormatContract<CodecSpec<Codec> & { kind: Codec["kind"] },
		Parameters<Codec["format"]>[0],
		CodecRounded<Codec>,
		RangeCapability<Codec>>];

/** @inline */
type Presentations<Codecs extends readonly AnyFormatCodec[]> = Codecs[number] extends infer Codec
	? Codec extends AnyFormatCodec ? Contracts<Codec>[number] : never : never;

/** Union of specifications accepted by the codecs installed on a formatter. */
export type FormatterSpec<Codecs extends readonly AnyFormatCodec[]> = Presentations<Codecs>["spec"];

/** @inline */
type Select<Contracts extends readonly FormatContract[], Spec> =
	Contracts extends readonly [infer Head extends FormatContract, ...infer Tail extends readonly FormatContract[]]
		? Spec extends Head["spec"] ? Head : Select<Tail, Spec>
		: never;

/** @inline */
type Selected<Codecs extends readonly AnyFormatCodec[], Spec> = Spec extends FormatSpecBase
	? Spec["kind"] extends keyof CodecMap<Codecs>
		? Select<Contracts<Extract<CodecMap<Codecs>[Spec["kind"]], AnyFormatCodec>>, Spec> : never : never;

/**
 * Value accepted for a specification by a formatter's codec tuple.
 *
 * For union specifications, the result is safe for every possible selected
 * presentation rather than a permissive union of their input values.
 */
export type FormatValue<Codecs extends readonly AnyFormatCodec[], Spec> =
	(Selected<Codecs, Spec> extends infer Contract
		? Contract extends FormatContract ? (value: Contract["value"]) => void : never : never) extends
		(value: infer Value) => void ? Value : never;
/** Rounded metadata inferred from the selected codec and presentation. */
export type RoundedValue<Codecs extends readonly AnyFormatCodec[], Spec> = Selected<Codecs, Spec>["rounded"];

/** Effective series options may differ from the input's literal options. @inline */
export type SeriesSpec<Codecs extends readonly AnyFormatCodec[], Spec> = Spec extends FormatSpecBase
	? Spec["kind"] extends keyof CodecMap<Codecs>
		? CodecMap<Codecs>[Spec["kind"]] extends infer Codec
			? "selectSeriesSpec" extends keyof Codec
				? Codec extends { selectSeriesSpec?: (...args: any[]) => infer Effective }
					? Extract<Effective, FormatSpecBase> & { kind: Spec["kind"] } : Spec
				: Spec
			: never
		: never
	: never;

/** @inline */
type Keys<Union> = Union extends unknown ? keyof Union : never;
/** Reject misspelled options even when the specification is inferred as a generic type. @inline */
export type CheckedSpec<Codecs extends readonly AnyFormatCodec[], Spec> = Spec & FormatSpecBase &
	Record<Exclude<keyof Spec, Keys<Selected<Codecs, Spec>["spec"]> | keyof FormatSpecBase>, never>;

/** Reject operations that are statically known to be unsupported. @inline */
export type RangeSpec<Codecs extends readonly AnyFormatCodec[], Spec> =
	CheckedSpec<Codecs, Spec> & (Selected<Codecs, Spec>["range"] extends false ? never : unknown);

/** @inline */
type Operation<Supported extends boolean, Methods> = [Supported] extends [true] ? Methods
	: [Supported] extends [false] ? {} : Partial<Methods>;

/**
 * Compiled formatter type inferred from the selected presentation.
 *
 * Range methods are present when their contract capability is
 * `true`, absent when it is `false`, and optional when support is known only at
 * runtime.
 */
export type CompiledFormat<Codecs extends readonly AnyFormatCodec[], Spec extends FormatSpecBase> =
	CompiledFormatter<FormatValue<Codecs, Spec>, Spec, RoundedValue<Codecs, Spec>> &
	Operation<Selected<Codecs, Spec>["range"], Pick<RangeCompiledFormatter<FormatValue<Codecs, Spec>, Spec, RoundedValue<Codecs, Spec>>, "formatRange" | "formatRangeToParts">>;
