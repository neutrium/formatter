import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

/** Deterministic, deduplicated runtime data; CLDR remains a development dependency. */
export function generateCardinalData()
{
	const source = require("cldr-core/supplemental/plurals.json").supplemental;
	const rules = source["plurals-type-cardinal"];
	const parents = require("cldr-core/supplemental/parentLocales.json").supplemental.parentLocales.parentLocale;
	const groups = new Map();
	const entries = Object.entries(rules);

	for (const [locale, parent] of Object.entries(parents))
	{
		if (!rules[locale] && rules[parent] && parent.includes("-"))
		{
			entries.push([locale, rules[parent]]);
		}
	}

	for (const [locale, categories] of entries.sort(([a], [b]) => a.localeCompare(b, "en")))
	{
		const conditions = Object.entries(categories).filter(([key]) => !key.endsWith("other"))
			.map(([key, rule]) => [key.replace("pluralRule-count-", ""), rule.split("@")[0].trim()]);

		// Fail generation if a future CLDR release introduces unsupported grammar.
		for (const [, condition] of conditions) for (const relation of condition.split(/ and | or /))
		{
			if (!/^[nivwftec](?: % \d+)? (!?=) \d+(?:\.\.\d+)?(?:,\d+(?:\.\.\d+)?)*$/.test(relation))
			{
				throw new Error(`Unsupported CLDR relation: ${relation}`);
			}
		}

		const key = JSON.stringify(conditions);

		if (!groups.has(key))
		{
			groups.set(key, []);
		}

		groups.get(key).push(locale);
	}

	return `// Generated from CLDR ${source.version._cldrVersion}; do not edit by hand.\n` +
		`// Unicode License V3: see UNICODE-LICENSE.txt.\n` +
		`export const CARDINAL_DATA: readonly (readonly [string, readonly (readonly [Intl.LDMLPluralRule, string])[]])[] = [\n` +
		[...groups].map(([rules, locales]) => `\t[${JSON.stringify(locales.join(" "))}, ${rules}],`).join("\n") + "\n];\n";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
{
	if (process.argv.length !== 3 || !["--check", "--write"].includes(process.argv[2]))
	{
		throw new Error("Usage: node tools/cardinal-data.mjs --check|--write");
	}

	const outputs = [
		[new URL("../src/numeric/native/cardinal-data.ts", import.meta.url), generateCardinalData()],
		[new URL("../UNICODE-LICENSE.txt", import.meta.url), readFileSync(require.resolve("cldr-core/LICENSE"), "utf8")],
	];

	for (const [file, content] of outputs)
	{
		if (process.argv[2] === "--write")
		{
			writeFileSync(file, content);
		}
		else if (readFileSync(file, "utf8") !== content)
		{
			throw new Error(`Stale generated file: ${file.pathname}`);
		}
	}
}
