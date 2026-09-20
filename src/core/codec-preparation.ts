import { AnyFormatCodec, FormatCodec, FormatContext, FormatSpecBase } from "./codec.js";
import { SeriesFormatOptions } from "./series.js";

/** Private execution plans for immutable built-ins; custom codecs use their public hooks. */
export interface CodecExecution<Value = any, Spec extends FormatSpecBase = any>
{
	codec: AnyFormatCodec;
	seriesStrings(values: readonly Value[], spec: Spec, context: FormatContext, options: SeriesFormatOptions): readonly string[];
}

type PrepareCodec<Value = any, Spec extends FormatSpecBase = any> =
	(spec: Spec, context: FormatContext) => CodecExecution<Value, Spec>;

const preparations = new WeakMap<AnyFormatCodec, PrepareCodec>();

export function registerCodecPreparation<Value, Spec extends FormatSpecBase, Parsed>(
	codec: FormatCodec<string, Value, Spec, Parsed>, prepare: PrepareCodec<Value, Spec>,
): void
{
	Object.freeze(codec);
	preparations.set(codec, prepare);
}

export function getCodecPreparation(codec: AnyFormatCodec): PrepareCodec | undefined
{
	return preparations.get(codec);
}
