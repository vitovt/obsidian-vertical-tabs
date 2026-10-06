import { create } from "zustand";
import { loadModule } from "./subgroup-fixtures.mjs";

export function archivedTab(id = "tab-1", path = "Notes/One.md") {
	return {
		kind: "tab", id, path, title: "One", icon: "file-text",
		viewState: { type: "markdown", state: { file: path, mode: "preview" }, pinned: true },
		customization: { title: "One", color: "#abc", icon: "file-text" },
	};
}

export function archivedSubgroup(tabs = [archivedTab()], id = "subgroup-1") {
	return { kind: "subgroup", id, title: "Research", collapsed: true, subgroupCollapsed: false, tabs };
}

export function setupArchive(raw) {
	const writes = [];
	const notices = [];
	let failWrites = false;
	const store = loadModule("src/stores/ArchiveStore.ts", {
		zustand: { create },
		obsidian: { Notice: class { constructor(message) { notices.push(message); } } },
		"src/constants/StorageKeys": { STORAGE_KEYS: { ARCHIVE: "archive" } },
		"./LocalStorageService": { localStorageService: { save: (_key, data) => {
			if (failWrites) throw new Error("Storage full");
			writes.push(JSON.stringify(data));
		} } },
	});
	store.hydrateArchive({ loadLocalStorage: () => raw });
	return { ...store, state: () => store.useArchive.getState(), writes, notices,
		failWrites: () => { failWrites = true; } };
}
