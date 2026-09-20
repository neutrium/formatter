import { parser } from "@neutrium/formatter/parse";
import {
	formatter,
	type BuiltInFormatSpec,
	type BuiltInFormatValue,
} from "@neutrium/formatter";
import availableLocales from "cldr-core/availableLocales.json";
import "./styles.css";

interface Preset
{
	readonly id: string;
	readonly label: string;
	readonly value: string;
	readonly locale: string;
	readonly spec: BuiltInFormatSpec;
}

const presets: readonly Preset[] = [
	{
		id: "exact",
		label: "Exact number",
		value: "9007199254740993.25",
		locale: "en-US",
		spec: { kind: "number", maximumFractionDigits: 2 },
	},
	{
		id: "currency",
		label: "Currency",
		value: "1234567.89",
		locale: "de-DE",
		spec: { kind: "currency", currency: "EUR" },
	},
	{
		id: "compact",
		label: "Compact",
		value: "1234567",
		locale: "en-US",
		spec: { kind: "number", notation: "compact", maximumFractionDigits: 2 },
	},
	{
		id: "percentage",
		label: "Percentage",
		value: "0.125",
		locale: "en-AU",
		spec: { kind: "percentage", maximumFractionDigits: 1 },
	},
	{
		id: "unit",
		label: "Unit",
		value: "12.5",
		locale: "en-GB",
		spec: { kind: "unit", unit: "kilometer-per-hour", unitDisplay: "long" },
	},
	{
		id: "bytes",
		label: "Bytes",
		value: "1536",
		locale: "en-US",
		spec: { kind: "bytes", maximumFractionDigits: 2 },
	},
	{
		id: "duration",
		label: "Duration",
		value: "{\n  \"hours\": 3,\n  \"minutes\": 25,\n  \"seconds\": 7\n}",
		locale: "fr-FR",
		spec: { kind: "duration", presentation: "localized", style: "long" },
	},
	{
		id: "accounting",
		label: "Accounting",
		value: "-1234.5",
		locale: "en-US",
		spec: {
			kind: "currency",
			currency: "USD",
			currencySign: "accounting",
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		},
	},
	{
		id: "basis-points",
		label: "Basis points",
		value: "0.0125",
		locale: "en-US",
		spec: {
			kind: "percentage",
			percentageScale: 10000,
			percentageSymbol: " bp",
			maximumFractionDigits: 0,
		},
	},
	{
		id: "ordinal",
		label: "Ordinal",
		value: "23",
		locale: "en-US",
		spec: { kind: "ordinal" },
	},
	{
		id: "elapsed",
		label: "Elapsed duration",
		value: "3661000",
		locale: "en-US",
		spec: { kind: "duration", presentation: "elapsed", inputUnit: "milliseconds" },
	},
];

const kinds = ["number", "currency", "percentage", "unit", "bytes", "ordinal", "duration"] as const;

interface LocaleOption
{
	readonly code: string;
	readonly name: string;
	readonly search: string;
}

const localeDisplayNames = new Intl.DisplayNames(navigator.languages, {
	type: "language",
	fallback: "code",
});
const localeCollator = new Intl.Collator(navigator.languages, { sensitivity: "base" });
const locales: readonly LocaleOption[] = Intl.NumberFormat
	.supportedLocalesOf([...new Set([...availableLocales.availableLocales.full, ...presets.map(preset => preset.locale)])])
	.map((code) => {
		const name = localeDisplayNames.of(code) ?? code;
		return { code, name, search: `${code} ${name}`.toLocaleLowerCase() };
	})
	.sort((left, right) => localeCollator.compare(left.name, right.name) || left.code.localeCompare(right.code));

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Demo root was not found");

app.innerHTML = `
	<header class="topbar">
		<div class="brand">
			<span class="brand-mark" aria-hidden="true"><img src="${import.meta.env.BASE_URL}neutrium-logo.png" alt="" /></span>
			<span>@neutrium/formatter</span>
		</div>
		<nav class="topnav" aria-label="Project links">
			<a href="../">API docs</a>
			<a href="https://github.com/neutrium/formatter">GitHub</a>
		</nav>
	</header>
	<main class="page">
		<section class="intro" aria-labelledby="page-title">
			<div>
				<p class="eyebrow">Interactive formatter lab</p>
				<h1 id="page-title">Locale rules, made visible.</h1>
			</div>
			<p class="intro-copy">Explore exact formatting, strict parsing, semantic parts, and runtime capabilities. Every result is generated locally by your browser.</p>
		</section>
		<div class="preset-bar" id="presets" role="group" aria-label="Example presets"></div>
		<section class="workspace" aria-label="Formatter playground">
			<form class="panel" id="controls" novalidate>
				<div class="panel-heading"><h2>Input</h2><span class="hint">Updates live</span></div>
				<div class="controls">
					<div class="field">
						<label for="value">Value <span class="hint">Exact numeric text or a duration record</span></label>
						<textarea id="value" spellcheck="false" rows="5"></textarea>
					</div>
					<div class="field-stack">
						<div class="field">
							<label for="kind">Format kind</label>
							<select id="kind">${kinds.map((kind) => `<option value="${kind}">${kind}</option>`).join("")}</select>
						</div>
						<div class="field">
							<label for="locale">Locale <span class="hint">Search by name or code</span></label>
							<div class="locale-picker" id="locale-picker">
								<input id="locale" type="search" role="combobox" aria-autocomplete="list" aria-controls="locale-list" aria-expanded="false" autocomplete="off" />
								<div class="locale-menu" id="locale-list" role="listbox" aria-label="Locales" hidden></div>
							</div>
							<span class="locale-count hint" id="locale-count" aria-live="polite"></span>
						</div>
					</div>
					<div class="field">
						<label for="options">Options <span class="hint">JSON, excluding kind and locale</span></label>
						<textarea id="options" spellcheck="false" rows="9" aria-describedby="options-help"></textarea>
						<span class="hint" id="options-help">Choose an example above, then edit its options. Omit optional keys to use defaults.</span>
					</div>
				</div>
			</form>

			<section class="panel result-panel" aria-label="Formatting result">
				<div class="panel-heading"><h2>Result</h2><span class="status" id="status" role="status">Ready</span></div>
				<div class="hero-output">
					<div class="output-label">Formatted output</div>
					<div class="output-value" id="output" aria-live="polite"></div>
					<div class="output-error" id="error" role="status" hidden></div>
				</div>
				<dl class="summary-grid">
					<div class="summary-item"><dt>Implementation</dt><dd id="implementation">—</dd></div>
					<div class="summary-item"><dt title="Parsing the formatted text may reflect rounding or other loss of precision.">Parsed result</dt><dd id="parsed">—</dd></div>
					<div class="summary-item"><dt>Parts</dt><dd id="part-count">—</dd></div>
				</dl>
				<div class="tabs" role="tablist" aria-label="Result details">
					<button class="tab active" type="button" role="tab" aria-selected="true" id="tab-parts" aria-controls="detail-panel" tabindex="0" data-tab="parts">Parts</button>
					<button class="tab" type="button" role="tab" aria-selected="false" id="tab-details" aria-controls="detail-panel" tabindex="-1" data-tab="details">Details</button>
					<button class="tab" type="button" role="tab" aria-selected="false" id="tab-code" aria-controls="detail-panel" tabindex="-1" data-tab="code">Code</button>
				</div>
				<div class="detail-view" id="detail-panel" role="tabpanel" aria-labelledby="tab-parts">
					<button class="copy-button" id="copy" type="button" aria-label="Copy result details">Copy</button>
					<pre id="detail-output" tabindex="0"></pre>
				</div>
			</section>
		</section>
		<footer class="footnote">
			<p>Exact decimal strings stay exact—no accidental Number coercion.</p>
			<p>Runs entirely in this page · no data is sent anywhere.</p>
		</footer>
	</main>
`;

const elements = {
	presets: document.querySelector<HTMLDivElement>("#presets")!,
	controls: document.querySelector<HTMLFormElement>("#controls")!,
	value: document.querySelector<HTMLTextAreaElement>("#value")!,
	kind: document.querySelector<HTMLSelectElement>("#kind")!,
	localePicker: document.querySelector<HTMLDivElement>("#locale-picker")!,
	locale: document.querySelector<HTMLInputElement>("#locale")!,
	localeList: document.querySelector<HTMLDivElement>("#locale-list")!,
	localeCount: document.querySelector<HTMLSpanElement>("#locale-count")!,
	options: document.querySelector<HTMLTextAreaElement>("#options")!,
	status: document.querySelector<HTMLSpanElement>("#status")!,
	output: document.querySelector<HTMLDivElement>("#output")!,
	error: document.querySelector<HTMLDivElement>("#error")!,
	implementation: document.querySelector<HTMLElement>("#implementation")!,
	parsed: document.querySelector<HTMLElement>("#parsed")!,
	partCount: document.querySelector<HTMLElement>("#part-count")!,
	detailOutput: document.querySelector<HTMLElement>("#detail-output")!,
	copy: document.querySelector<HTMLButtonElement>("#copy")!,
};

let activeTab: "parts" | "details" | "code" = "parts";
let activePreset = "exact";
let views = { parts: "", details: "", code: "" };
let activeLocaleIndex = -1;
let visibleLocales = locales;
let committedLocale = "en-US";

function escapeHtml(value: string): string
{
	return value.replace(/[&<>"']/g, (character) => ({
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		"\"": "&quot;",
		"'": "&#039;",
	})[character]!);
}

function renderLocaleOptions(query = ""): void
{
	const normalizedQuery = query.trim().toLocaleLowerCase();
	visibleLocales = normalizedQuery
		? locales.filter((locale) => locale.search.includes(normalizedQuery))
		: locales;
	activeLocaleIndex = -1;
	elements.localeCount.textContent = `${visibleLocales.length} of ${locales.length} browser-supported locales`;
	elements.localeList.innerHTML = visibleLocales.length
		? visibleLocales.map((locale, index) => `
			<button
				class="locale-option${index === activeLocaleIndex ? " active" : ""}"
				id="locale-option-${index}"
				type="button"
				role="option"
				tabindex="-1"
				aria-selected="${locale.code === committedLocale}"
				data-locale="${locale.code}"
			>
				<span>${escapeHtml(locale.name)}</span>
				<span class="locale-code">${locale.code}</span>
			</button>
		`).join("")
		: `<div class="locale-empty">No matching locales</div>`;
	elements.locale.removeAttribute("aria-activedescendant");
}

function openLocaleList(query = ""): void
{
	renderLocaleOptions(query);
	elements.localeList.hidden = false;
	elements.locale.setAttribute("aria-expanded", "true");
}

function closeLocaleList(restore = false): void
{
	if (restore) elements.locale.value = committedLocale;
	elements.localeCount.textContent = `${locales.length} browser-supported locales`;
	elements.localeList.hidden = true;
	elements.locale.setAttribute("aria-expanded", "false");
	elements.locale.removeAttribute("aria-activedescendant");
}

function chooseLocale(locale: LocaleOption): void
{
	committedLocale = locale.code;
	elements.locale.value = locale.code;
	closeLocaleList();
	render();
}

function moveActiveLocale(direction: 1 | -1): void
{
	if (!visibleLocales.length) return;
	activeLocaleIndex = activeLocaleIndex < 0
		? (direction === 1 ? 0 : visibleLocales.length - 1)
		: (activeLocaleIndex + direction + visibleLocales.length) % visibleLocales.length;
	elements.localeList.querySelectorAll(".locale-option").forEach((option, index) => {
		option.classList.toggle("active", index === activeLocaleIndex);
	});
	const activeOption = document.querySelector<HTMLElement>(`#locale-option-${activeLocaleIndex}`);
	activeOption?.scrollIntoView({ block: "nearest" });
	elements.locale.setAttribute("aria-activedescendant", `locale-option-${activeLocaleIndex}`);
}

function optionsFor(preset: Preset): Record<string, unknown>
{
	const { kind: _kind, locale: _locale, ...options } = preset.spec;
	return options;
}

function renderPresets(): void
{
	if (!elements.presets.childElementCount)
	{
		elements.presets.innerHTML = presets.map((preset) => `
			<button class="preset" type="button" data-preset="${preset.id}">${preset.label}</button>
		`).join("");
	}
	elements.presets.querySelectorAll<HTMLButtonElement>("[data-preset]").forEach((button) => {
		const active = button.dataset.preset === activePreset;
		button.classList.toggle("active", active);
		button.setAttribute("aria-pressed", String(active));
	});
}

function applyPreset(preset: Preset): void
{
	activePreset = preset.id;
	elements.value.value = preset.value;
	elements.kind.value = preset.spec.kind;
	committedLocale = preset.locale;
	elements.locale.value = preset.locale;
	closeLocaleList();
	elements.options.value = JSON.stringify(optionsFor(preset), null, 2);
	renderPresets();
	render(false);
}

function readValue(kind: string): BuiltInFormatValue
{
	const source = elements.value.value.trim();
	if (kind === "duration" && source.startsWith("{")) return JSON.parse(source) as BuiltInFormatValue;
	return source;
}

function readSpec(): BuiltInFormatSpec
{
	let options: Record<string, unknown>;
	try
	{
		options = elements.options.value.trim() ? JSON.parse(elements.options.value) : {};
	}
	catch
	{
		elements.options.setAttribute("aria-invalid", "true");
		throw new SyntaxError("Options must be valid JSON. Use double quotes for keys and strings, and remove trailing commas.");
	}
	if (typeof options !== "object" || Array.isArray(options) || options === null)
	{
		elements.options.setAttribute("aria-invalid", "true");
		throw new TypeError("Options must be a JSON object");
	}
	return {
		...options,
		kind: elements.kind.value,
		locale: committedLocale,
	} as BuiltInFormatSpec;
}

function codeFor(value: BuiltInFormatValue, spec: BuiltInFormatSpec): string
{
	const valueSource = typeof value === "string" ? JSON.stringify(value) : JSON.stringify(value, null, 2);
	return `import { formatter } from "@neutrium/formatter";\n\nconst output = formatter.format(\n  ${valueSource?.replace(/\n/g, "\n  ")},\n  ${JSON.stringify(spec, null, 2).replace(/\n/g, "\n  ")},\n);\n\n// ${JSON.stringify(elements.output.textContent)}`;
}

function renderDetail(): void
{
	elements.detailOutput.textContent = views[activeTab];
	document.querySelector("#detail-panel")!.setAttribute("aria-labelledby", `tab-${activeTab}`);
}

function render(clearPreset = true): void
{
	if (clearPreset)
	{
		activePreset = "";
		renderPresets();
	}
	elements.options.removeAttribute("aria-invalid");
	try
	{
		const spec = readSpec();
		const value = readValue(spec.kind);
		const details = formatter.formatDetailed(value as never, spec as never);
		const { text: result, parts, resolution } = details;
		let parsed = "Format only";
		if (spec.kind !== "duration" || spec.presentation === "elapsed")
		{
			try { parsed = parser.parse(result, spec); }
			catch { parsed = "Not recoverable"; }
		}

		elements.output.textContent = result;
		elements.output.hidden = false;
		elements.error.hidden = true;
		elements.status.textContent = "Valid";
		elements.status.classList.remove("error");
		elements.implementation.textContent = resolution.implementation;
		elements.parsed.textContent = parsed;
		elements.partCount.textContent = `${parts.length} semantic ${parts.length === 1 ? "part" : "parts"}`;
		views = {
			parts: JSON.stringify(parts, null, 2),
			details: JSON.stringify(details, null, 2),
			code: codeFor(value, spec),
		};
	}
	catch (error)
	{
		const message = error instanceof Error ? error.message : String(error);
		elements.output.hidden = true;
		elements.error.hidden = false;
		elements.error.textContent = message;
		elements.status.textContent = "Invalid";
		elements.status.classList.add("error");
		elements.implementation.textContent = "—";
		elements.parsed.textContent = "—";
		elements.partCount.textContent = "—";
		views = { parts: message, details: message, code: "Fix the input to generate an example." };
	}
	renderDetail();
}

elements.presets.addEventListener("click", (event) => {
	const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-preset]");
	const preset = presets.find((candidate) => candidate.id === button?.dataset.preset);
	if (preset) applyPreset(preset);
});

elements.controls.addEventListener("submit", (event) => event.preventDefault());
elements.controls.addEventListener("input", () => render());

elements.locale.addEventListener("focus", () => {
	elements.locale.select();
	openLocaleList();
});

elements.locale.addEventListener("input", (event) => {
	event.stopPropagation();
	openLocaleList(elements.locale.value);
});

elements.locale.addEventListener("keydown", (event) => {
	if (event.key === "ArrowDown" || event.key === "ArrowUp")
	{
		event.preventDefault();
		if (elements.localeList.hidden) openLocaleList(elements.locale.value);
		moveActiveLocale(event.key === "ArrowDown" ? 1 : -1);
	}
	else if (event.key === "Enter" && !elements.localeList.hidden && visibleLocales.length)
	{
		event.preventDefault();
		chooseLocale(visibleLocales[activeLocaleIndex >= 0 ? activeLocaleIndex : 0]);
	}
	else if (event.key === "Escape")
	{
		event.preventDefault();
		closeLocaleList(true);
	}
});

// Keep DOM focus in the combobox while selecting a list option.
elements.localeList.addEventListener("mousedown", (event) => event.preventDefault());
elements.locale.addEventListener("blur", () => closeLocaleList(true));

elements.localeList.addEventListener("click", (event) => {
	const option = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-locale]");
	const locale = locales.find((candidate) => candidate.code === option?.dataset.locale);
	if (locale) chooseLocale(locale);
});

document.addEventListener("click", (event) => {
	if (!elements.localePicker.contains(event.target as Node)) closeLocaleList(true);
});

document.querySelectorAll<HTMLButtonElement>(".tab").forEach((tab) => {
	tab.addEventListener("click", () => {
		activeTab = tab.dataset.tab as typeof activeTab;
		document.querySelectorAll<HTMLButtonElement>(".tab").forEach((candidate) => {
			const active = candidate === tab;
			candidate.classList.toggle("active", active);
			candidate.setAttribute("aria-selected", String(active));
			candidate.tabIndex = active ? 0 : -1;
		});
		renderDetail();
	});
});

const tabs = [...document.querySelectorAll<HTMLButtonElement>(".tab")];
tabs.forEach((tab, index) => {
	tab.addEventListener("keydown", (event) => {
		let next: number;
		if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
		else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
		else if (event.key === "Home") next = 0;
		else if (event.key === "End") next = tabs.length - 1;
		else return;
		event.preventDefault();
		tabs[next].focus();
		tabs[next].click();
	});
});

elements.copy.addEventListener("click", async () => {
	try
	{
		await navigator.clipboard.writeText(views[activeTab]);
		elements.copy.textContent = "Copied";
	}
	catch
	{
		elements.copy.textContent = "Copy failed";
	}
	window.setTimeout(() => { elements.copy.textContent = "Copy"; }, 1200);
});

renderPresets();
renderLocaleOptions();
applyPreset(presets[0]);
