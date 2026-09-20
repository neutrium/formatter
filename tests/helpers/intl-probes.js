// Synchronous instrumentation only. Keep callers serial within each test file:
// built-in constructors and prototypes are shared by all tests in a process.
export function withProperty(target, name, replacement, action) {
	const descriptor = Object.getOwnPropertyDescriptor(target, name);
	Object.defineProperty(target, name, { configurable: true, ...replacement });
	try {
		return action();
	} finally {
		if (descriptor) Object.defineProperty(target, name, descriptor);
		else delete target[name];
	}
}

// Handles both methods (including inherited methods) and Intl's bound format getter.
export function withMethod(target, name, wrap, action) {
	const descriptor = Object.getOwnPropertyDescriptor(target, name);
	return withProperty(target, name, descriptor?.get ? {
		...descriptor, get() { return wrap(descriptor.get.call(this)); },
	} : {
		...descriptor, value: wrap(target[name]),
	}, action);
}

export function countCalls(target, name, action) {
	let calls = 0;
	return withMethod(target, name, original => function (...args) {
		calls++;
		return original.apply(this, args);
	}, () => {
		action(() => calls);
		return calls;
	});
}

export function countNumberParts(action) {
	return countCalls(Intl.NumberFormat.prototype, "formatToParts", action);
}

export function countRendering(constructors, action) {
	const targets = constructors.flatMap(Constructor => ["format", "formatToParts"].map(name => [Constructor.prototype, name]));
	let calls = 0;
	function instrument(index) {
		if (index === targets.length) return action(() => calls);
		const [target, name] = targets[index];
		return withMethod(target, name, original => function (...args) {
			calls++;
			return original.apply(this, args);
		}, () => instrument(index + 1));
	}
	instrument(0);
	return calls;
}
