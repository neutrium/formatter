import { AnyFormatCodec } from "./codec.js";
import type { RegistryOptions } from "./RegistryOptions.js";

/**
 * Constructor options for the low-level {@link extensions!Formatter} registry.
 *
 * The constructor installs exactly the supplied codecs. Use
 * {@link index!createFormatter} to include the built-in codecs automatically.
 */
export interface FormatterOptions<Codecs extends readonly AnyFormatCodec[] = readonly AnyFormatCodec[]>
	extends Readonly<RegistryOptions<Codecs>> {}
