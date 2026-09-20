import type { NumberFormatSpec, CurrencyFormatSpec, UnitFormatSpec } from "./native/spec.js";
import type { PercentageFormatSpec } from "./percentage/spec.js";
import type { OrdinalFormatSpec } from "./ordinal/spec.js";
import type { BytesFormatSpec } from "./bytes/spec.js";

export type { NumberNotation, NumberFormatSpec, CurrencyFormatSpec, UnitFormatSpec } from "./native/spec.js";
export type { PercentageFormatSpec } from "./percentage/spec.js";
export type { OrdinalFormatSpec } from "./ordinal/spec.js";
export type { BytesFormatSpec } from "./bytes/spec.js";

/** Discriminated union of every built-in numeric specification. */
export type NumericFormatSpec =
	| NumberFormatSpec
	| CurrencyFormatSpec
	| UnitFormatSpec
	| PercentageFormatSpec
	| OrdinalFormatSpec
	| BytesFormatSpec;
