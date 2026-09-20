import { FormatContext, FormatSpecBase } from "./codec.js";
import { ResolvedFormat, SupportedResolvedFormat, unsupportedCapabilities } from "./capabilities.js";
import { DuplicateFormatError, UnknownFormatError } from "./errors.js";

const formatMethods = ["formatString", "formatSeries", "selectSeriesSpec", "formatRange", "formatDetailed", "resolve"] as const;
const parseMethods = ["resolve"] as const;

/** Validate the operation's contract once, before admitting a codec to its registry. */
function validateCodec(codec: unknown, operation: "format" | "parse"): asserts codec is { kind: string }
{
	if (codec === null || typeof codec !== "object")
	{
		throw new TypeError("A codec must be an object");
	}

	const candidate = codec as Record<string, unknown>;

	if (typeof candidate.kind !== "string" || candidate.kind.trim() === "")
	{
		throw new TypeError("A codec kind must be a non-empty string");
	}

	if (typeof candidate[operation] !== "function")
	{
		throw new TypeError(`Codec '${candidate.kind}' must provide a callable ${operation} method`);
	}

	for (const method of operation === "format" ? formatMethods : parseMethods)
	{
		if (candidate[method] !== undefined && typeof candidate[method] !== "function")
			throw new TypeError(`Codec '${candidate.kind}' method '${method}' must be a function when provided`);
	}
}

/** Shared registry storage; no formatting or parsing implementations are imported here. */
export function createRegistry<const Codecs extends readonly { readonly kind: string }[]>(options: {
	codecs?: Codecs; locale?: string; context?: Readonly<Record<string, unknown>>;
}, operation: "format" | "parse")
{
	const codecs = Object.freeze([...(options.codecs ?? [])]) as unknown as Codecs;
	if (options.locale !== undefined && typeof options.locale !== "string")
	{
		throw new RangeError("Locale must be a valid locale string");
	}

	const context: FormatContext = Object.freeze({
		locale: Intl.getCanonicalLocales(options.locale === undefined ? "en-US" : options.locale)[0],
		data: Object.freeze({ ...(options.context ?? {}) }),
	});
	const byKind = new Map<string, Codecs[number]>();

	for (const codec of codecs)
	{
		validateCodec(codec, operation);
		if (byKind.has(codec.kind)) throw new DuplicateFormatError(codec.kind);
		byKind.set(codec.kind, codec);
	}

	return {
		codecs,
		context,
		get(kind: string): Codecs[number]
		{
			const codec = byKind.get(kind);
			if (!codec)
			{
				throw new UnknownFormatError(kind);
			}

			return codec;
		}
	};
}

/** Inspection serializes failures; operational calls keep the original error identity. */
export function inspectResolution(spec: FormatSpecBase, resolve: () => SupportedResolvedFormat): ResolvedFormat
{
	let kind = "";

	try
	{
		const discriminator = spec?.kind;
		if (typeof discriminator === "string")
		{
			kind = discriminator;
		}

		return resolve();
	}
	catch (error)
	{
		return Object.freeze({
			kind,
			supported: false,
			implementation: null,
			capabilities: unsupportedCapabilities(),
			error: Object.freeze(
				error instanceof Error ? { name: error.name, message: error.message } :
				{ name: "Error", message: String(error) }
			)
		});
	}
}
