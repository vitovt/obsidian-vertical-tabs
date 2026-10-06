import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";
import { create } from "zustand";

export function loadModule(path, imports, globals = {}) {
	const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
	const { code } = transformSync(source, {
		loader: path.endsWith("tsx") ? "tsx" : "ts", format: "cjs", jsx: "automatic",
	});
	const module = { exports: {} };
	runInNewContext(code, {
		module, exports: module.exports,
		require: (name) => imports[name] ?? {},
		console: { error() {} },
		activeDocument: { body: {} },
		...globals,
	});
	return module.exports;
}

export function setup(raw) {
	let nextId = 0;
	const writes = [];
	const notices = [];
	const store = loadModule("src/stores/SubgroupStore.ts", {
		zustand: { create },
		nanoid: { nanoid: () => `subgroup-${++nextId}` },
		obsidian: { Notice: class { constructor(message) { notices.push(message); } } },
		"src/constants/StorageKeys": { STORAGE_KEYS: { SUBGROUPS: "subgroups" } },
		"./LocalStorageService": { localStorageService: {
			save: (_key, data) => writes.push(JSON.stringify(data)),
		} },
	});
	store.hydrateSubgroups({ loadLocalStorage: () => raw });
	return { ...store, state: () => store.useSubgroups.getState(), writes, notices };
}
