/**
 * Inspect available Intl features with `@neutrium/formatter/diagnostics`.
 *
 * {@link runtimeCapabilities} returns a cached feature snapshot. To validate
 * a particular specification, use {@link extensions!Formatter.resolve} or
 * {@link extensions-parse!Parser.resolve} instead.
 * @module
 */
export { getRuntimeCapabilities as runtimeCapabilities } from "./core/runtime-diagnostics.js";
export type { RuntimeCapabilities } from "./core/capabilities.js";
export { supportedOrdinalLocales, supportsOrdinal } from "./numeric/ordinal/patterns.js";
