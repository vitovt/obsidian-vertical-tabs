import { App, Notice, ViewState } from "obsidian";
import { create } from "zustand";
import { STORAGE_KEYS } from "src/constants/StorageKeys";
import { TabUpdates } from "./TabMetadataDB";
import { localStorageService } from "./LocalStorageService";

export interface ArchivedTab {
	kind: "tab";
	id: string;
	path: string;
	title: string;
	icon: string;
	viewState: ViewState;
	customization: TabUpdates;
}

export interface ArchivedSubgroup {
	kind: "subgroup";
	id: string;
	title: string;
	collapsed: boolean;
	subgroupCollapsed: boolean;
	tabs: ArchivedTab[];
}

export type ArchiveEntry = ArchivedTab | ArchivedSubgroup;
export interface ArchiveData {
	version: 1;
	collapsed: boolean;
	entries: ArchiveEntry[];
}

const emptyData = (): ArchiveData => ({ version: 1, collapsed: false, entries: [] });
const isRecord = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === "object" && !Array.isArray(value);

// Keep unsupported records intact instead of silently overwriting bookmarks.
export function parseArchiveData(value: unknown): ArchiveData | null {
	if (!isRecord(value) || value.version !== 1 || typeof value.collapsed !== "boolean" ||
		!Array.isArray(value.entries)) return null;
	const ids = new Set<string>();
	const claimId = (id: unknown): id is string => {
		if (typeof id !== "string" || !id || ids.has(id)) return false;
		ids.add(id);
		return true;
	};
	const parseTab = (tab: unknown): ArchivedTab | null => {
		if (!isRecord(tab) || tab.kind !== "tab" || !claimId(tab.id) ||
			typeof tab.path !== "string" || !tab.path || typeof tab.title !== "string" ||
			typeof tab.icon !== "string" || !isRecord(tab.viewState) ||
			typeof tab.viewState.type !== "string" || !tab.viewState.type ||
			!isRecord(tab.viewState.state) || !isRecord(tab.customization) ||
			(tab.viewState.pinned !== undefined && typeof tab.viewState.pinned !== "boolean")) return null;
		const customization: TabUpdates = {};
		for (const key of ["title", "icon", "color"] as const) {
			const field = tab.customization[key];
			if (field !== undefined && typeof field !== "string") return null;
			if (typeof field === "string") customization[key] = field;
		}
		return {
			kind: "tab", id: tab.id, path: tab.path, title: tab.title, icon: tab.icon,
			viewState: { type: tab.viewState.type, state: { ...tab.viewState.state, file: tab.path },
				pinned: tab.viewState.pinned }, customization,
		};
	};
	const entries: ArchiveEntry[] = [];
	for (const entry of value.entries as unknown[]) {
		if (!isRecord(entry)) return null;
		if (entry.kind === "tab") {
			const tab = parseTab(entry);
			if (!tab) return null;
			entries.push(tab);
		} else if (entry.kind === "subgroup") {
			if (!claimId(entry.id) || typeof entry.title !== "string" ||
				typeof entry.collapsed !== "boolean" || typeof entry.subgroupCollapsed !== "boolean" ||
				!Array.isArray(entry.tabs)) return null;
			const tabs: ArchivedTab[] = [];
			for (const value of entry.tabs as unknown[]) {
				const tab = parseTab(value);
				if (!tab) return null;
				tabs.push(tab);
			}
			entries.push({ kind: "subgroup", id: entry.id, title: entry.title,
				collapsed: entry.collapsed, subgroupCollapsed: entry.subgroupCollapsed, tabs });
		} else return null;
	}
	return { version: 1, collapsed: value.collapsed, entries };
}

interface ArchiveStore {
	data: ArchiveData;
	readOnly: boolean;
	busyIds: string[];
	add: (entry: ArchiveEntry) => boolean;
	addMany: (entries: ArchiveEntry[]) => boolean;
	remove: (id: string) => boolean;
	removeTabs: (id: string, tabIds: string[]) => boolean;
	setCollapsed: (collapsed: boolean) => void;
	setEntryCollapsed: (id: string, collapsed: boolean) => void;
	renamePath: (oldPath: string, newPath: string) => void;
	setBusy: (id: string, busy: boolean) => void;
	reset: () => boolean;
}

function updateData(transform: (data: ArchiveData) => ArchiveData): boolean {
	const { data, readOnly } = useArchive.getState();
	if (readOnly) return false;
	const next = transform(data);
	if (next === data) return true;
	try {
		// Save before publishing the change: archiving must not close tabs if
		// their bookmark could not be written to persistent storage.
		localStorageService.save(STORAGE_KEYS.ARCHIVE, next);
		useArchive.setState({ data: next });
		return true;
	} catch (error) {
		console.error("[VerticalTabs] Failed to save archive:", error);
		new Notice("Vertical Tabs: could not save the archive. The action was cancelled.");
		return false;
	}
}

export const useArchive = create<ArchiveStore>()((set, get) => ({
	data: emptyData(),
	readOnly: true,
	busyIds: [],
	add: (entry) => get().addMany([entry]),
	addMany: (entries) => updateData((data) => entries.length
		? { ...data, collapsed: false, entries: [...data.entries, ...entries] } : data),
	remove: (id) => updateData((data) => data.entries.some((entry) => entry.id === id)
		? { ...data, entries: data.entries.filter((entry) => entry.id !== id) } : data),
	removeTabs: (id, tabIds) => updateData((data) => {
		const entry = data.entries.find((entry) => entry.id === id);
		if (!entry || entry.kind !== "subgroup" || !entry.tabs.some((tab) => tabIds.includes(tab.id))) return data;
		const tabs = entry.tabs.filter((tab) => !tabIds.includes(tab.id));
		return { ...data, entries: data.entries.flatMap((item) => item !== entry ? [item]
			: tabs.length ? [{ ...entry, tabs }] : []) };
	}),
	setCollapsed: (collapsed) => updateData((data) => data.collapsed === collapsed ? data : { ...data, collapsed }),
	setEntryCollapsed: (id, collapsed) => updateData((data) => {
		const entry = data.entries.find((entry) => entry.id === id);
		if (entry?.kind !== "subgroup" || entry.collapsed === collapsed) return data;
		return { ...data, entries: data.entries.map((item) => item === entry ? { ...entry, collapsed } : item) };
	}),
	renamePath: (oldPath, newPath) => updateData((data) => {
		let changed = false;
		const renameTab = (tab: ArchivedTab): ArchivedTab => {
			if (tab.path !== oldPath && !tab.path.startsWith(`${oldPath}/`)) return tab;
			changed = true;
			const path = newPath + tab.path.slice(oldPath.length);
			const name = path.split("/").pop() ?? path;
			return { ...tab, path, title: tab.customization.title || name.replace(/\.[^.]+$/, ""),
				viewState: { ...tab.viewState, state: { ...tab.viewState.state, file: path } } };
		};
		const entries = data.entries.map((entry) => entry.kind === "tab" ? renameTab(entry)
			: { ...entry, tabs: entry.tabs.map(renameTab) });
		return changed ? { ...data, entries } : data;
	}),
	setBusy: (id, busy) => set((state) => ({
		busyIds: busy ? [...state.busyIds, id] : state.busyIds.filter((item) => item !== id),
	})),
	reset: () => {
		const wasReadOnly = useArchive.getState().readOnly;
		set({ readOnly: false });
		const saved = updateData(() => emptyData());
		if (!saved) set({ readOnly: wasReadOnly });
		return saved;
	},
}));

export function hydrateArchive(app: App) {
	try {
		const raw: unknown = app.loadLocalStorage(STORAGE_KEYS.ARCHIVE);
		const data = raw === null || raw === undefined || raw === "" ? emptyData()
			: parseArchiveData(typeof raw === "string" ? JSON.parse(raw) as unknown : raw);
		if (!data) throw new Error("Unsupported archive data");
		useArchive.setState({ data, readOnly: false, busyIds: [] });
	} catch (error) {
		console.error("[VerticalTabs] Failed to load archive:", error);
		useArchive.setState({ data: emptyData(), readOnly: true, busyIds: [] });
		new Notice("Vertical Tabs: the saved archive could not be loaded. The original data has been kept; use Reset archive to clear it.", 0);
	}
}
