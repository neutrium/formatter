import { createNumericCodec } from "./shared/codec-factory.js";
import { byteEngine, nativeEngine, ordinalEngine, percentageEngine } from "./engines.js";
import type { BytesFormatSpec, CurrencyFormatSpec, NumberFormatSpec, OrdinalFormatSpec, PercentageFormatSpec, UnitFormatSpec } from "./specs.js";
/** Built-in range-capable codec for IEC and SI byte sizes. */
export const bytesCodec = /* @__PURE__ */ createNumericCodec<"bytes", BytesFormatSpec>("bytes", byteEngine);
/** Built-in range-capable `Intl.NumberFormat` currency codec. */
export const currencyCodec = /* @__PURE__ */ createNumericCodec<"currency", CurrencyFormatSpec>("currency", nativeEngine);
/** Built-in range-capable `Intl.NumberFormat` decimal codec. */
export const numberCodec = /* @__PURE__ */ createNumericCodec<"number", NumberFormatSpec>("number", nativeEngine);
/** Built-in range-capable localized ordinal codec. */
export const ordinalCodec = /* @__PURE__ */ createNumericCodec<"ordinal", OrdinalFormatSpec>("ordinal", ordinalEngine);
/** Built-in range-capable `Intl.NumberFormat` percentage codec. */
export const percentageCodec = /* @__PURE__ */ createNumericCodec<"percentage", PercentageFormatSpec>("percentage", percentageEngine);
/** Built-in range-capable `Intl.NumberFormat` measurement-unit codec. */
export const unitCodec = /* @__PURE__ */ createNumericCodec<"unit", UnitFormatSpec>("unit", nativeEngine);
export const numericCodecs = [
	numberCodec,
	currencyCodec,
	percentageCodec,
	unitCodec,
	ordinalCodec,
	bytesCodec,
] as const;
