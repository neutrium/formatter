import test from "node:test";
import assert from "node:assert/strict";
import { withProperty, withMethod, countCalls, countRendering } from "./helpers/intl-probes.js";
import { runIsolated } from "./helpers/isolated-process.js";

test("temporary overrides restore exact descriptors after nested assertion failures", () => {
	const target = {};
	Object.defineProperty(target, "value", { configurable: true, get: () => "original" });
	const descriptor = Object.getOwnPropertyDescriptor(target, "value");
	const failure = new Error("assertion failure");
	assert.throws(() => withProperty(target, "value", { value: "outer" }, () => {
		assert.throws(() => withProperty(target, "value", { value: "inner" }, () => {
			assert.equal(target.value, "inner");
			throw failure;
		}), error => error === failure);
		assert.equal(target.value, "outer");
		throw failure;
	}), error => error === failure);
	assert.deepEqual(Object.getOwnPropertyDescriptor(target, "value"), descriptor);
});

test("method instrumentation preserves receivers, return values, and inherited properties", () => {
	const prototype = { method(increment) { return this.value + increment; } };
	const target = Object.assign(Object.create(prototype), { value: 2 });
	assert.equal(countCalls(target, "method", calls => {
		assert.equal(target.method(3), 5);
		assert.equal(calls(), 1);
	}), 1);
	assert.equal(Object.hasOwn(target, "method"), false);
	const failure = new Error("injected failure");
	assert.throws(() => withMethod(target, "method", () => () => { throw failure; }, () => target.method()),
		error => error === failure);
	assert.equal(Object.hasOwn(target, "method"), false);
});

test("render counters support bound getters and restore every target on failure", () => {
	class Renderer {
		get format() { return value => this.formatToParts(value).join(""); }
		formatToParts(value) { return [String(value)]; }
	}
	const before = Object.getOwnPropertyDescriptors(Renderer.prototype);
	const instance = new Renderer();
	const failure = new Error("render assertion");
	assert.throws(() => countRendering([Renderer], calls => {
		const format = instance.format;
		assert.equal(calls(), 0, "Reading the bound getter is not a render");
		assert.equal(format(12), "12");
		assert.equal(calls(), 2);
		throw failure;
	}), error => error === failure);
	assert.deepEqual(Object.getOwnPropertyDescriptors(Renderer.prototype), before);
});

test("isolated processes have fresh globals and report child assertion output", () => {
	globalThis.formatterTestSentinel = true;
	try { runIsolated("assert.equal(globalThis.formatterTestSentinel, undefined)"); }
	finally { delete globalThis.formatterTestSentinel; }
	assert.throws(() => runIsolated("console.log('child context'); assert.fail('child assertion')"), error =>
		error.message.includes("child context") && error.message.includes("child assertion") && error.status !== 0);
});
