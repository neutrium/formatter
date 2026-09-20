import { AnyFormatCodec } from "./core/codec.js";
import { Formatter } from "./core/Formatter.js";
import type { RegistryOptions } from "./core/RegistryOptions.js";
import { durationCodec } from "./duration/codec.js";
import { numericCodecs } from "./numeric/codecs.js";

/** @inline */
const builtInCodecs = [...numericCodecs, durationCodec] as const;

/** Tuple type of the number, currency, percentage, unit, ordinal, bytes, and duration codecs. */
export type BuiltInCodecs = typeof builtInCodecs;

/** Options for {@link index!createFormatter}. */
export interface CreateFormatterOptions<Codecs extends readonly AnyFormatCodec[] = readonly []>
	extends RegistryOptions<Codecs> {}

/**
 * Creates an independent, strongly typed formatter.
 *
 * Built-in codecs are always included. Custom codecs are appended in tuple
 * order and participate in specification, value, rounded metadata, and compiled
 * capability inference. Use `new Formatter({ codecs })` for an isolated registry.
 * Parsing is configured separately with {@link parse!createParser}.
 *
 * @param options - Default locale (`en-US`), application context, and additional codecs.
 * @returns A formatter with all built-ins and the additional codecs' inferred types.
 * @throws {@link index!DuplicateFormatError} for duplicate kinds, including built-in kinds.
 * @throws `TypeError` for an invalid codec kind or method shape.
 * @throws `RangeError` for an invalid locale identifier.
 *
 * @example Configure a default locale
 * ```ts
 * import { createFormatter } from "@neutrium/formatter";
 *
 * const german = createFormatter({ locale: "de-DE" });
 * german.format(1234.5, { kind: "number" });
 * // "1.234,5"
 * ```
 *
 * @example Add a format-only custom codec
 * ```ts
 * import { createFormatter } from "@neutrium/formatter";
 * import type { FormatCodec } from "@neutrium/formatter/extensions";
 *
 * const labelCodec = {
 *   kind: "label",
 *   format(value: string) {
 *     return [{ type: "literal", value }];
 *   },
 * } satisfies FormatCodec<"label", string>;
 *
 * const custom = createFormatter({ codecs: [labelCodec] });
 * custom.format("ready", { kind: "label" });
 * // "ready"
 * ```
 */
export function createFormatter(options?: CreateFormatterOptions): Formatter<BuiltInCodecs>;
export function createFormatter<const Codecs extends readonly AnyFormatCodec[]>(
	options: CreateFormatterOptions<Codecs> & { codecs: Codecs },
): Formatter<readonly [...BuiltInCodecs, ...Codecs]>;
export function createFormatter(options: CreateFormatterOptions<readonly AnyFormatCodec[]> = {}): Formatter<any>
{
	return new Formatter({
		codecs: [...builtInCodecs, ...(options.codecs ?? [])],
		locale: options.locale,
		context: options.context,
	});
}
