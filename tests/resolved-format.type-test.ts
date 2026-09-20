import { formatter, type ResolvedFormat } from "@neutrium/formatter";
// @ts-expect-error Resolution branch types are internal, not package exports.
import type { SupportedResolvedFormat } from "@neutrium/formatter";
// @ts-expect-error Resolution branch types are internal, not package exports.
import type { UnsupportedResolvedFormat } from "@neutrium/formatter";

const result: ResolvedFormat = formatter.resolve({ kind: "number" });
if (result.supported) {
	const locale: string = result.locale;
	const error: undefined = result.error;
	void locale;
	void error;
} else {
	const message: string = result.error.message;
	const implementation: null = result.implementation;
	void message;
	void implementation;
}

// Consumers can select a branch without importing an additional named type.
const compiledResolution: Extract<ResolvedFormat, { supported: true }> =
	formatter.compile({ kind: "number" }).resolution;
const supported: true = compiledResolution.supported;
void supported;

// Detailed results cannot carry an unsuccessful resolution, without exposing branch types.
for (const detailed of [
	formatter.formatDetailed(1, { kind: "number" }),
	formatter.compile({ kind: "number" }).formatDetailed(1),
	formatter.compileSeries([900, 1200], { kind: "number", notation: "compact" }).formatDetailed(900),
]) {
	const success: true = detailed.resolution.supported;
	const locale: string = detailed.resolution.locale;
	const implementation: import("@neutrium/formatter").FormatImplementation = detailed.resolution.implementation;
	const error: undefined = detailed.resolution.error;
	// @ts-expect-error Failed resolutions are not valid in a detailed result.
	const failure: Extract<ResolvedFormat, { supported: false }> = detailed.resolution;
	void [success, locale, implementation, error, failure];
}
