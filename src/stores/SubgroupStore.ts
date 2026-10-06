import { App, Notice } from "obsidian";
import { nanoid } from "nanoid";
import { create } from "zustand";
import { localStorageService } from "./LocalStorageService";
import { STORAGE_KEYS } from "src/constants/StorageKeys";

export interface Subgroup {
	id: string;
	title: string;
	collapsed: boolean;
}

export interface SubgroupData {
	version: 1;
	subgroupsByGroup: Record<string, Subgroup[]>;
	subgroupByLeaf: Record<string, string>;
}

const emptyData = (): SubgroupData => ({
	version: 1,
	subgroupsByGroup: {},
	subgroupByLeaf: {},
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === "object" && !Array.isArray(value);

// Reject unsupported/corrupt records rather than replacing saved organization.
export function parseSubgroupData(value: unknown): SubgroupData | null {
	if (!isRecord(value) || value.version !== 1 ||
		!isRecord(value.subgroupsByGroup) || !isRecord(value.subgroupByLeaf)) return null;
	const groups: [string, Subgroup[]][] = [];
	const ids = new Set<string>();
	for (const [groupId, entries] of Object.entries(value.subgroupsByGroup)) {
		if (!Array.isArray(entries)) return null;
		const subgroups: Subgroup[] = [];
		for (const entry of entries as unknown[]) {
			if (!isRecord(entry) || typeof entry.id !== "string" || !entry.id ||
				typeof entry.title !== "string" || typeof entry.collapsed !== "boolean" ||
				ids.has(entry.id)) return null;
			ids.add(entry.id);
			subgroups.push({ id: entry.id, title: entry.title, collapsed: entry.collapsed });
		}
		groups.push([groupId, subgroups]);
	}
	const membership: [string, string][] = [];
	for (const [leafId, subgroupId] of Object.entries(value.subgroupByLeaf)) {
		if (typeof subgroupId !== "string") return null;
		if (ids.has(subgroupId)) membership.push([leafId, subgroupId]);
	}
	return {
		version: 1,
		subgroupsByGroup: Object.fromEntries(groups),
		subgroupByLeaf: Object.fromEntries(membership),
	};
}

export function getSubgroupOwner(data: SubgroupData, id: string): string | undefined {
	return Object.keys(data.subgroupsByGroup).find((groupId) =>
		data.subgroupsByGroup[groupId]?.some((subgroup) => subgroup.id === id));
}

export function getLeafSubgroup(data: SubgroupData, leafId: string, groupId: string): string | undefined {
	const id = data.subgroupByLeaf[leafId];
	return id && getSubgroupOwner(data, id) === groupId ? id : undefined;
}

interface SubgroupStore {
	data: SubgroupData;
	editingId: string | null;
	readOnly: boolean;
	create: (groupId: string, title?: string, leafIds?: string[]) => string | null;
	rename: (id: string, title: string) => void;
	setCollapsed: (id: string, collapsed: boolean) => void;
	setAllCollapsed: (collapsed: boolean) => void;
	startEditing: (id: string | null) => void;
	remove: (id: string) => void;
	assign: (leafIds: string[], subgroupId?: string) => void;
	move: (id: string, groupId: string, beforeId?: string) => void;
	reconcile: (leafParents: Map<string, string>) => void;
	reset: () => void;
}

let initialized = false;
let writeErrorReported = false;

function updateData(transform: (data: SubgroupData) => SubgroupData) {
	const { data, readOnly } = useSubgroups.getState();
	if (readOnly) return;
	const next = transform(data);
	if (next === data) return;
	useSubgroups.setState({ data: next });
	if (!initialized) return;
	try {
		localStorageService.save(STORAGE_KEYS.SUBGROUPS, next);
	} catch (error) {
		console.error("[VerticalTabs] Failed to save subgroups:", error);
		if (!writeErrorReported) {
			writeErrorReported = true;
			new Notice("Vertical Tabs: failed to save subgroups. Changes may be lost after restart.", 0);
		}
	}
}

function editSubgroup(id: string, edit: (subgroup: Subgroup) => Subgroup) {
	updateData((data) => {
		const owner = getSubgroupOwner(data, id);
		if (!owner) return data;
		const current = data.subgroupsByGroup[owner]?.find((subgroup) => subgroup.id === id);
		if (!current) return data;
		const edited = edit(current);
		if (edited === current) return data;
		return {
			...data,
			subgroupsByGroup: {
				...data.subgroupsByGroup,
				[owner]: (data.subgroupsByGroup[owner] ?? []).map((subgroup) =>
					subgroup.id === id ? edited : subgroup),
			},
		};
	});
}

export const useSubgroups = create<SubgroupStore>()((set, get) => ({
	data: emptyData(),
	editingId: null,
	readOnly: false,
	create: (groupId, title = "New subgroup", leafIds = []) => {
		if (get().readOnly) return null;
		const id = nanoid();
		updateData((data) => ({
			...data,
			subgroupsByGroup: {
				...data.subgroupsByGroup,
				[groupId]: [...(data.subgroupsByGroup[groupId] ?? []), {
					id, title: title.trim() || "New subgroup", collapsed: false,
				}],
			},
			subgroupByLeaf: {
				...data.subgroupByLeaf,
				...Object.fromEntries(leafIds.map((leafId) => [leafId, id])),
			},
		}));
		set({ editingId: id });
		return id;
	},
	rename: (id, title) => {
		const trimmed = title.trim();
		if (trimmed) editSubgroup(id, (subgroup) => subgroup.title === trimmed ? subgroup : { ...subgroup, title: trimmed });
		set({ editingId: null });
	},
	setCollapsed: (id, collapsed) => editSubgroup(id, (subgroup) => subgroup.collapsed === collapsed ? subgroup : { ...subgroup, collapsed }),
	setAllCollapsed: (collapsed) => updateData((data) => ({
		...data,
		subgroupsByGroup: Object.fromEntries(Object.entries(data.subgroupsByGroup).map(([id, groups]) =>
			[id, groups.map((subgroup) => ({ ...subgroup, collapsed }))])),
	})),
	startEditing: (editingId) => set({ editingId }),
	remove: (id) => {
		updateData((data) => {
			const owner = getSubgroupOwner(data, id);
			if (!owner) return data;
			return {
				...data,
				subgroupsByGroup: {
					...data.subgroupsByGroup,
					[owner]: (data.subgroupsByGroup[owner] ?? []).filter((subgroup) => subgroup.id !== id),
				},
				subgroupByLeaf: Object.fromEntries(Object.entries(data.subgroupByLeaf).filter(([, target]) => target !== id)),
			};
		});
		if (get().editingId === id) set({ editingId: null });
	},
	assign: (leafIds, subgroupId) => updateData((data) => {
		if (subgroupId && !getSubgroupOwner(data, subgroupId)) return data;
		const membership = { ...data.subgroupByLeaf };
		let changed = false;
		for (const id of leafIds) {
			if (membership[id] === subgroupId) continue;
			changed = true;
			if (subgroupId) membership[id] = subgroupId;
			else delete membership[id];
		}
		return changed ? { ...data, subgroupByLeaf: membership } : data;
	}),
	move: (id, groupId, beforeId) => updateData((data) => {
		const owner = getSubgroupOwner(data, id);
		const subgroup = owner ? data.subgroupsByGroup[owner]?.find((entry) => entry.id === id) : undefined;
		if (!owner || !subgroup || id === beforeId) return data;
		const groups = { ...data.subgroupsByGroup };
		groups[owner] = (groups[owner] ?? []).filter((entry) => entry.id !== id);
		const target = [...(groups[groupId] ?? [])];
		const index = beforeId ? target.findIndex((entry) => entry.id === beforeId) : -1;
		target.splice(index < 0 ? target.length : index, 0, subgroup);
		groups[groupId] = target;
		return { ...data, subgroupsByGroup: groups };
	}),
	reconcile: (leafParents) => updateData((data) => {
		const owners = new Map<string, string>();
		for (const [groupId, subgroups] of Object.entries(data.subgroupsByGroup)) {
			for (const subgroup of subgroups) owners.set(subgroup.id, groupId);
		}
		const membership = Object.entries(data.subgroupByLeaf).filter(([id, subgroupId]) =>
			leafParents.get(id) === owners.get(subgroupId) && leafParents.has(id));
		return membership.length === Object.keys(data.subgroupByLeaf).length
			? data : { ...data, subgroupByLeaf: Object.fromEntries(membership) };
	}),
	reset: () => {
		set({ readOnly: false, editingId: null });
		updateData(() => emptyData());
	},
}));

export function hydrateSubgroups(app: App) {
	initialized = false;
	writeErrorReported = false;
	try {
		const raw: unknown = app.loadLocalStorage(STORAGE_KEYS.SUBGROUPS);
		const data = raw === null || raw === undefined || raw === ""
			? emptyData() : parseSubgroupData(typeof raw === "string" ? JSON.parse(raw) as unknown : raw);
		if (!data) throw new Error("Unsupported subgroup data");
		useSubgroups.setState({ data, editingId: null, readOnly: false });
	} catch (error) {
		console.error("[VerticalTabs] Failed to load subgroups:", error);
		useSubgroups.setState({ data: emptyData(), editingId: null, readOnly: true });
		new Notice("Vertical Tabs: saved subgroups could not be loaded. The original data has been kept; use Reset customization to clear it.", 0);
	}
	initialized = true;
}
