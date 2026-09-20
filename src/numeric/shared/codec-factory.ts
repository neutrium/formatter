import { registerCodecPreparation } from "../../core/codec-preparation.js";
import type { FormatCodec, FormatContext } from "../../core/codec.js";
import type { ContractCodec, FormatContract } from "../../core/FormatterTypes.js";
import type { NumericValue } from "../../types.js";
import type { NumericEngine } from "./engine.js";
import { prepareNumericOperations } from "./orchestration.js";
import type { NumericFormatSpec } from "../specs.js";
export function createNumericCodec<Kind extends NumericFormatSpec["kind"], Spec extends Extract<NumericFormatSpec, { kind: Kind;}>>(
	kind: Kind,
	engine: NumericEngine
): Readonly<FormatCodec<Kind, NumericValue, Spec, string>> & ContractCodec<readonly [FormatContract<Spec, NumericValue, string, true>]>
{
	function prepare(spec: NumericFormatSpec, context: FormatContext)
	{
		// The facade retains these bound operations in its prepared-format cache.
		return prepareNumericOperations(engine, engine.prepare(spec, context));
	}

	const codec: FormatCodec<Kind, NumericValue, Spec, string> = {
		kind,
		format: (value, spec, context) => engine.prepare(spec, context).format(value),
		formatString: (value, spec, context) => engine.prepare(spec, context).formatString(value),
		formatDetailed: (value, spec, context) => engine.prepare(spec, context).detailedValue(value),
		formatSeries: (values, spec, context, options) => prepare(spec, context).codec.formatSeries!(values, spec, context, options),
		selectSeriesSpec: (values, spec, context) => prepare(spec, context).codec.selectSeriesSpec!(values, spec, context),
		formatRange: (start, end, spec, context) => prepare(spec, context).codec.formatRange!(start, end, spec, context),
		resolve: (spec, context) => engine.prepare(spec, context).resolution,
	};
	registerCodecPreparation<NumericValue, Spec, string>(codec, prepare);

	return codec;
}
