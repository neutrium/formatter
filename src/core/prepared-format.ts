import { textWidth } from "./text-width.js";
import { CodecExecution, getCodecPreparation } from "./codec-preparation.js";
import { AnyFormatCodec, FormatContext, FormatSpecBase } from "./codec.js";
import { DetailedFormatResult, SupportedResolvedFormat } from "./capabilities.js";
import { UnsupportedRangeError } from "./errors.js";
import { resolveFormat } from "./resolution.js";
import { alignColumn, columnLayout, ColumnFormatOptions, SeriesFormatOptions } from "./series.js";
import { FormatToken, RangeFormatToken, renderTokens } from "./tokens.js";

/** Internal execution state; built-ins retain validated options and rendering resources. */
export interface PreparedFormat
{
	readonly codec: AnyFormatCodec;
	readonly spec: FormatSpecBase;
	readonly context: FormatContext;
	readonly resolution: SupportedResolvedFormat;
	readonly seriesStrings?: CodecExecution["seriesStrings"];
}

/** Resolve once without reconstructing errors; reuse the built-in execution plan when available. */
export function prepare(codec: AnyFormatCodec, spec: FormatSpecBase, context: FormatContext): PreparedFormat
{
	const execution = getCodecPreparation(codec)?.(spec, context);
	const active = execution?.codec ?? codec;
	return Object.freeze({ codec: active, spec, context, seriesStrings: execution?.seriesStrings,
		resolution: resolveFormat(active, spec, context) });
}

export function selectSeriesSpec(prepared: PreparedFormat, values: readonly unknown[]): FormatSpecBase
{
	return prepared.codec.selectSeriesSpec?.(values, prepared.spec, prepared.context) ?? prepared.spec;
}

export function format(prepared: PreparedFormat, value: unknown): string
{
	const { spec, context } = prepared;
	const codec = prepared.codec;
	return codec.formatString
		? codec.formatString(value, spec, context)
		: renderTokens(formatToParts(prepared, value));
}

export function formatToParts(prepared: PreparedFormat, value: unknown): readonly FormatToken[]
{
	return prepared.codec.format(value, prepared.spec, prepared.context);
}

export function formatDetailed<Rounded>(prepared: PreparedFormat, value: unknown): DetailedFormatResult<Rounded>
{
	const { spec, context, resolution } = prepared;
	const codec = prepared.codec;

	if (codec.formatDetailed)
	{
		const { parts, ...metadata } = codec.formatDetailed(value, spec, context);
		return Object.freeze({ ...metadata, text: renderTokens(parts), parts, resolution }) as DetailedFormatResult<Rounded>;
	}

	const parts = formatToParts(prepared, value);
	const formatted = renderTokens(parts);

	return Object.freeze({ text: formatted, parts, resolution }) as DetailedFormatResult<Rounded>;
}

export function formatSeriesToParts(
	prepared: PreparedFormat,
	values: readonly unknown[],
	options: SeriesFormatOptions = {},
): readonly (readonly FormatToken[])[]
{
	validateSeriesOptions(options);
	const { spec, context } = prepared;
	const codec = prepared.codec;

	return codec.formatSeries
		? codec.formatSeries(values, spec, context, options)
		: values.map((value) => codec.format(value, spec, context));
}

function validateSeriesOptions(options: SeriesFormatOptions): void
{
	if (options.scale !== undefined && options.scale !== "individual" && options.scale !== "shared")
	{
		throw new RangeError(`Unsupported series scale: ${options.scale}`);
	}
}

export function formatSeries(prepared: PreparedFormat, values: readonly unknown[], options: SeriesFormatOptions = {}): readonly string[]
{
	validateSeriesOptions(options);
	const { codec, spec, context } = prepared;

	if (prepared.seriesStrings)
	{
		return prepared.seriesStrings(values, spec, context, options);
	}

	// Custom series renderers may choose shared scales or other domain-specific output.
	if (codec.formatSeries)
	{
		return codec.formatSeries(values, spec, context, options).map(renderTokens);
	}

	return values.map(value => format(prepared, value));
}

export function formatColumn(prepared: PreparedFormat, values: readonly unknown[], options: ColumnFormatOptions = {}): readonly string[]
{
	const layout = columnLayout(options);

	if (layout.align !== "decimal")
	{
		return alignColumn(formatSeries(prepared, values, options), [], layout);
	}

	const parts = formatSeriesToParts(prepared, values, options);
	const rendered = parts.map(renderTokens);
	const decimals = parts.map((cell) => {
		const index = cell.findIndex((part) => part.type === "decimal");

		return index < 0
			? { offset: -1, separator: "" }
			: {
				offset: textWidth(renderTokens(cell.slice(0, index))),
				separator: cell[index].value,
			};
	});

	return alignColumn(rendered, decimals, layout);
}

export function formatRangeToParts(prepared: PreparedFormat, start: unknown, end: unknown): readonly RangeFormatToken[]
{
	const { spec, context, resolution } = prepared;
	const codec = prepared.codec;

	if (!resolution.capabilities.range || !codec.formatRange)
	{
		throw new UnsupportedRangeError(spec.kind);
	}

	return codec.formatRange(start, end, spec, context);
}

export function formatRange(prepared: PreparedFormat, start: unknown, end: unknown): string
{
	return renderTokens(formatRangeToParts(prepared, start, end));
}
