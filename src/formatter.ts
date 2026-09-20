import { createFormatter, type BuiltInCodecs } from "./create-formatter.js";
import type { Formatter } from "./core/Formatter.js";

/**
 * Shared formatter containing the number, currency, percentage, unit, ordinal,
 * bytes, and duration codecs. Its default locale is `en-US`; a specification's
 * `locale` option can override that default for one operation.
 *
 * Use {@link index!createFormatter} when an application needs a different default
 * locale, application context, or custom codecs.
 *
 * @example Format with the shared instance
 * ```ts
 * import { formatter } from "@neutrium/formatter";
 *
 * formatter.format(1234.5, { kind: "currency", currency: "USD" });
 * // "$1,234.50"
 *
 * formatter.format(1200000, { kind: "number", notation: "compact" });
 * // "1.2M"
 * ```
 */
export const formatter: Formatter<BuiltInCodecs> = createFormatter();
