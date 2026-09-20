import type { NumericDisplayOptions } from "../../types.js";

/**
 * Locale-aware SI or IEC byte-size specification.
 *
 * @example
 * ```ts
 * import { formatter } from "@neutrium/formatter";
 *
 * formatter.format(1536, { kind: "bytes" });
 * // "1.5 KiB"
 *
 * formatter.format(1_500_000, { kind: "bytes", byteBase: 1000 });
 * // "1.5 MB"
 * ```
 */
export interface BytesFormatSpec extends NumericDisplayOptions
{
	/** Selects the built-in bytes codec. */
	kind: "bytes";
	/** `1024` for IEC units or `1000` for SI units. Defaults to `1024`. */
	byteBase?: 1000 | 1024;
	/** Fixes one byte magnitude (`0` = B, `1` = kB/KiB, ... `8` = YB/YiB). */
	byteExponent?: number;
}
