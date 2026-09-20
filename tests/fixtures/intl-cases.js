// Shared data for Node regression matrices and the cross-browser compatibility suite.
// Keep input saturation separate from values that cross a limit only after rounding.
export const numericExtremes = [
	["1e400", Infinity], ["-1e400", -Infinity], ["1e-400", 0], ["-1e-400", -0],
];

// These locales exercise fractional unit grammar after compact rounding.
export const compactUnitLocales = ["ru", "pl", "cs", "lt"];
