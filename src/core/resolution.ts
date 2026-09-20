import { CodecFormatResolution, FormatContext, FormatSpecBase } from "./codec.js";
import { FormatCapabilities, SupportedResolvedFormat } from "./capabilities.js";

function definedRecord(value: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>>
{
	return Object.freeze(Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)));
}

/** Internal throwing resolver shared by inspection and compilation. */
export function resolveFormat(
	codec: {
		resolve?(spec: any, context: FormatContext): CodecFormatResolution;
		format?: unknown; formatRange?: unknown; parse?: unknown;
	},
	spec: FormatSpecBase,
	context: FormatContext,
	operation: "format" | "parse" = "format"
): SupportedResolvedFormat
{
	const kind = typeof spec?.kind === "string" ? spec.kind : "";

	if (typeof codec[operation] !== "function")
	{
		throw new TypeError(`Codec '${kind}' must provide a callable ${operation} method`);
	}

	const codecResolution = codec.resolve?.(spec, context);
	const locale = codecResolution?.locale ??
		Intl.getCanonicalLocales(spec.locale || context.locale)[0];
	const rangeImplementation = operation === "parse" ? "unsupported" : codecResolution?.rangeImplementation ??
		(typeof codec.formatRange === "function" ? "custom" : "unsupported");

	if (codecResolution?.parse === true && typeof codec.parse !== "function")
	{
		throw new TypeError(`Format codec '${kind}' reports parsing support without a parse implementation`);
	}

	if (rangeImplementation !== "unsupported" && typeof codec.formatRange !== "function")
	{
		throw new TypeError(`Format codec '${kind}' reports range support without a range implementation`);
	}

	const canFormat = operation === "format" && typeof codec.format === "function";
	const capabilities: FormatCapabilities = Object.freeze({
		format: canFormat,
		formatToParts: canFormat,
		parse: operation === "parse" && (codecResolution?.parse ?? typeof codec.parse === "function"),
		series: canFormat,
		columns: canFormat,
		range: rangeImplementation !== "unsupported",
		rangeImplementation,
	});
	const intl = codecResolution?.intl
		? Object.freeze({
			...codecResolution.intl,
			requestedOptions: definedRecord(codecResolution.intl.requestedOptions),
			resolvedOptions: definedRecord(codecResolution.intl.resolvedOptions),
		})
		: undefined;

	return Object.freeze({
		kind,
		locale,
		supported: true,
		implementation: codecResolution?.implementation ?? "custom",
		capabilities,
		...(intl ? { intl } : {}),
	});
}
