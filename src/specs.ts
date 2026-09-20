import { DurationFormatSpec, DurationRecordValue } from "./duration/spec.js";
import { NumericFormatSpec } from "./numeric/specs.js";
import { NumericValue } from "./types.js";

/** Discriminated union of every specification included by {@link index!createFormatter}. */
export type BuiltInFormatSpec = NumericFormatSpec | DurationFormatSpec;
/** Value accepted by at least one built-in codec. */
export type BuiltInFormatValue = NumericValue | DurationRecordValue;
