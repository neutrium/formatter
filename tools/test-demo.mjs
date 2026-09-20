import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

const server = await createServer({
	configFile: fileURLToPath(new URL("../demo/vite.config.mjs", import.meta.url)),
	server: { host: "127.0.0.1", port: 0, hmr: false },
});
let browser;

try
{
	await server.listen();
	browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
	const errors = [];
	page.on("pageerror", error => errors.push(error.message));
	await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/formatter/demo/`);
	await page.waitForSelector(".preset");
	const valid = async () => assert.equal(await page.locator("#status").textContent(), "Valid", await page.locator("#error").textContent());
	await valid();

	// Every example loads editable JSON and leaves keyboard focus on its button.
	for (const id of await page.locator(".preset").evaluateAll(buttons => buttons.map(button => button.dataset.preset)))
	{
		const button = page.locator(`[data-preset="${id}"]`);
		await button.focus();
		await page.keyboard.press("Enter");
		await valid();
		assert.equal(await button.getAttribute("aria-pressed"), "true");
		assert.equal(await button.evaluate(node => node === document.activeElement), true);
		JSON.parse(await page.locator("#options").inputValue());
	}

	assert.equal(await page.locator("#output").textContent(), "1:01:01");
	assert.equal(await page.locator("#parsed").textContent(), "3661000");

	await page.locator('[data-preset="exact"]').click();
	await page.locator("#options").fill('{"maximumFractionDigits":');
	assert.equal(await page.locator("#status").textContent(), "Invalid");
	assert.equal(await page.locator("#options").getAttribute("aria-invalid"), "true");
	await page.locator("#options").fill('{"useGrouping":false}');
	await valid();
	assert.equal(await page.locator("#options").getAttribute("aria-invalid"), null);
	assert.equal(await page.locator("#output").textContent(), "9007199254740993.25");

	// Tab dismisses an unfinished search and does not tab through hundreds of locales.
	await page.locator("#locale").fill("no-such-locale");
	await page.keyboard.press("Tab");
	assert.equal(await page.locator("#locale").inputValue(), "en-US");
	assert.equal(await page.locator("#locale-list").isHidden(), true);
	assert.equal(await page.locator("#options").evaluate(node => node === document.activeElement), true);
	await page.locator("#value").fill("1234.5");
	await valid();

	await page.locator("#locale").focus();
	await page.keyboard.press("ArrowUp");
	const lastId = await page.locator(".locale-option").last().getAttribute("id");
	assert.equal(await page.locator("#locale").getAttribute("aria-activedescendant"), lastId);
	await page.keyboard.press("Escape");
	await page.locator("#locale").fill("de-DE");
	await page.locator('[data-locale="de-DE"]').click();
	assert.equal(await page.locator("#locale").inputValue(), "de-DE");
	await valid();
	assert.equal(await page.locator("#output").textContent(), "1234,5");

	await page.locator("#tab-parts").focus();
	await page.keyboard.press("ArrowRight");
	assert.equal(await page.locator("#tab-details").getAttribute("aria-selected"), "true");
	await page.keyboard.press("End");
	assert.equal(await page.locator("#detail-panel").getAttribute("aria-labelledby"), "tab-code");
	assert.equal(await page.locator('.tab[tabindex="0"]').count(), 1);
	// A newline in custom text must remain inside the generated output comment.
	await page.locator("#value").fill("0");
	await page.locator("#options").fill(JSON.stringify({ zeroDisplay: "first\nsecond" }));
	await valid();
	const code = await page.locator("#detail-output").textContent();
	new Function(code.replace(/^import .*;\n/, ""));

	for (const width of [1440, 768, 390, 320])
	{
		await page.setViewportSize({ width, height: 1000 });
		assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Overflow at ${width}px`);
		assert.equal(await page.locator("#presets").evaluate(node => node.scrollWidth <= node.clientWidth), true);
	}

	if (process.env.DEMO_SCREENSHOTS)
	{
		await page.locator('[data-preset="exact"]').click();

		for (const width of [1440, 390])
		{
			await page.setViewportSize({ width, height: 1000 });
			await page.evaluate(() => window.scrollTo(0, 0));
			await page.screenshot({ path: `/tmp/formatter-demo-${width}.png`, fullPage: true });
		}
	}

	assert.deepEqual(errors, []);
	console.log("Demo checks passed: presets, JSON recovery, locale selection, keyboard navigation, code generation and responsive layout.");
}
finally
{
	await browser?.close();
	await server.close();
}
