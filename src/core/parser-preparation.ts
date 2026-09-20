import type { AnyParseCodec } from "./Parser.js";
import type { CodecFormatResolution, FormatContext } from "./codec.js";

/** Bound execution for immutable built-ins; custom parsers retain their public hooks. */
interface PreparedParser
{
	parse(input: string): any;
	resolve(): CodecFormatResolution;
}

type PrepareParser = (spec: any, context: FormatContext) => PreparedParser;
const preparations = new WeakMap<AnyParseCodec, PrepareParser>();

export function registerParserPreparation(codec: AnyParseCodec, prepare: PrepareParser): void
{
	Object.freeze(codec);
	preparations.set(codec, prepare);
}

export function getParserPreparation(codec: AnyParseCodec): PrepareParser | undefined
{
	return preparations.get(codec);
}
