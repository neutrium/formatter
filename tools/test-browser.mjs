import { chromium, firefox, webkit } from "playwright";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const failures = [];
const server = await createServer({
	configFile: false, root, server: { host: "127.0.0.1", port: 0, hmr: false },
	optimizeDeps: { include: ["@neutrium/decimal/arithmetic"] },
	resolve: { alias: [
		{ find: "@neutrium/formatter/parse", replacement: fileURLToPath(new URL("../dist/parse.js", import.meta.url)) },
		{ find: "@neutrium/formatter/diagnostics", replacement: fileURLToPath(new URL("../dist/diagnostics.js", import.meta.url)) },
		{ find: "@neutrium/formatter", replacement: fileURLToPath(new URL("../dist/index.js", import.meta.url)) },
	] },
});

try
{
	await server.listen();
	const address = server.httpServer.address();

	for (const engine of [chromium, firefox, webkit])
	{
		const browser = await engine.launch();

		try
		{
			const page = await browser.newPage();
			await page.goto(`http://127.0.0.1:${address.port}/tests/browser/index.html`);
			const names = await page.evaluate(async () => {
				const { cases } = await import("/tests/browser/compatibility.js");
				return cases.map(entry => entry.name);
			});
			let passed = 0;

			for (let index = 0; index < names.length; index++)
			{
				const failure = await page.evaluate(async index => {
					const { cases } = await import("/tests/browser/compatibility.js");

					try
					{
						cases[index].run((actual, expected) => {
							if (!Object.is(actual, expected)) throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
						});
						return null;
					}
					catch (error)
					{
						return error.stack || String(error);
					}
				}, index);

				if (failure)
				{
					const message = `${engine.name()}: ${names[index]}\n${failure}`;
					failures.push(new Error(message));
					console.error(message);
				}
				else
				{
					passed++;
				}
			}
			console.log(`${engine.name()} ${browser.version()}: ${passed}/${names.length} compatibility cases passed`);
		}
		finally
		{
			await browser.close();
		}
	}
}
finally
{
	await server.close();
}

if (failures.length)
{
	throw new AggregateError(failures, "Browser compatibility checks failed");
}
