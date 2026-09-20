/** Shared construction options; public interfaces constrain the codec tuple. @inline */
export interface RegistryOptions<Codecs extends readonly unknown[]>
{
	/** Additional factory codecs, or the complete codec tuple for an explicit registry. */
	codecs?: Codecs;
	/** Default BCP 47 locale for operations that omit `locale`. Defaults to `en-US`. */
	locale?: string;
	/** Shallow-copied application data supplied to codec operations and resolution hooks. */
	context?: Readonly<Record<string, unknown>>;
}
