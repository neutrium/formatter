import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
	root: fileURLToPath(new URL(".", import.meta.url)),
	base: "/formatter/demo/",
	resolve: {
		alias: {
			"@neutrium/formatter/parse": fileURLToPath(new URL("../dist/parse.js", import.meta.url)),
			"@neutrium/formatter": fileURLToPath(new URL("../dist/index.js", import.meta.url)),
		},
	},
	build: {
		outDir: fileURLToPath(new URL("../docs/demo", import.meta.url)),
		emptyOutDir: true,
	},
});
