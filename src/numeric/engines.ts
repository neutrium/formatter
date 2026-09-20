import { byteDomain } from "./bytes/formatter.js";
import { createNumericEngine } from "./shared/engine.js";
import { nativeDomain } from "./native/formatter.js";
import { ordinalDomain } from "./ordinal/formatter.js";
import { percentageDomain } from "./percentage/formatter.js";

/** Scalar engines shared by formatting and parsing without collection adapters. */
export const byteEngine = /* @__PURE__ */ createNumericEngine(byteDomain);
export const ordinalEngine = /* @__PURE__ */ createNumericEngine(ordinalDomain);
export const nativeEngine = /* @__PURE__ */ createNumericEngine(nativeDomain);
export const percentageEngine = /* @__PURE__ */ createNumericEngine(percentageDomain);
