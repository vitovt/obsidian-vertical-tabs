import { App, Menu, Notice, TFile, View, WorkspaceLeaf, WorkspaceParent, WorkspaceSplit } from "obsidian";
import { nanoid } from "nanoid";
import { ArchiveEntry, ArchivedTab, useArchive } from "src/stores/ArchiveStore";
import { getSubgroupOwner, useSubgroups } from "src/stores/SubgroupStore";
import { tabCacheStore } from "src/stores/TabCacheStore";
import { useSettings } from "src/models/PluginContext";
import { useViewState } from "src/models/ViewState";
import { getGroupType, GroupType } from "src/models/VTWorkspace";
import { getOpenFileOfLeaf } from "./GetTabs";
import { closeSubgroup, getSubgroupLeaves, moveTabsIntoSubgroup, withSubgroupMove } from "./Subgroups";
import { makeLeafNonEphemeral } from "./EphemeralTabs";
import { loadDeferredLeaf } from "./LoadDeferredLeaf";
import { confirmAction } from "src/views/ConfirmActionModal";

async function withArchiveAction(keys: string[], operation: () => Promise<void>): Promise<void> {
	const store = useArchive.getState();
	if (store.readOnly || keys.some((key) => store.busyIds.includes(key))) return;
	for (const key of keys) store.setBusy(key, true);
	try {
		await operation();
	} finally {
		for (const key of keys) useArchive.getState().setBusy(key, false);
	}
}

function snapshotTab(app: App, leaf: WorkspaceLeaf): ArchivedTab | null {
	const file = getOpenFileOfLeaf(app, leaf);
	if (!file) return null;
	const metadata = tabCacheStore.getState().tabMetadata.get(leaf.id);
	const customization = { title: metadata?.title, icon: metadata?.icon, color: metadata?.color };
	// View states must be a detached, serializable snapshot of the file view.
	const viewState = JSON.parse(JSON.stringify(leaf.getViewState())) as ArchivedTab["viewState"];
	viewState.state = { ...viewState.state, file: file.path };
	delete viewState.active;
	return {
		kind: "tab", id: nanoid(), path: file.path,
		title: customization.title || file.basename,
		icon: customization.icon || leaf.getIcon(), viewState, customization,
	};
}

export async function archiveTabs(app: App, leafIds: string[]): Promise<void> {
	const ids = [...new Set(leafIds)];
	await withArchiveAction(ids.map((id) => `archive-tab:${id}`), async () => {
		const leaves = ids.map((id) => app.workspace.getLeafById(id)).filter((leaf): leaf is WorkspaceLeaf => !!leaf);
		const pairs = leaves.flatMap((leaf) => {
			const tab = snapshotTab(app, leaf);
			return tab ? [{ leaf, tab }] : [];
		});
		if (!pairs.length || !useArchive.getState().addMany(pairs.map(({ tab }) => tab))) return;
		await withSubgroupMove(app, () => {
			for (const { leaf } of pairs) leaf.detach();
		});
	});
}

export async function archiveSubgroup(app: App, id: string): Promise<void> {
	if (useSubgroups.getState().readOnly) return;
	await withArchiveAction([`archive-subgroup:${id}`], async () => {
		const data = useSubgroups.getState().data;
		const owner = getSubgroupOwner(data, id);
		const subgroup = owner ? data.subgroupsByGroup[owner]?.find((entry) => entry.id === id) : undefined;
		if (!subgroup) return;
		const tabs = getSubgroupLeaves(app, id).flatMap((leaf) => {
			const tab = snapshotTab(app, leaf);
			return tab ? [tab] : [];
		});
		if (!useArchive.getState().add({ kind: "subgroup", id: nanoid(), title: subgroup.title,
			collapsed: true, subgroupCollapsed: subgroup.collapsed, tabs })) return;
		// File tabs are saved; service tabs are explicitly closed without bookmarks.
		await closeSubgroup(app, id);
	});
}

interface RestoreTarget {
	group: WorkspaceParent;
	placeholder?: WorkspaceLeaf;
}

function getRestoreTarget(app: App): RestoreTarget {
	const workspace = app.workspace;
	const candidates = [workspace.getActiveViewOfType(View)?.leaf, useViewState.getState().latestActiveLeaf, workspace.getMostRecentLeaf()];
	const anchor = candidates.find((leaf) => leaf && workspace.getLeafById(leaf.id) === leaf &&
		leaf.view.getViewType() !== "vertical-tabs" && getGroupType(app, leaf.parent) === GroupType.RootSplit);
	if (anchor) return { group: anchor.parent };
	// Obsidian chooses the main area when no active document group remains.
	const placeholder = workspace.getLeaf("tab");
	return { group: placeholder.parent, placeholder };
}

async function openArchivedTab(app: App, tab: ArchivedTab, file: TFile, target: RestoreTarget): Promise<WorkspaceLeaf> {
	const settings = useSettings.getState();
	let existing: WorkspaceLeaf | undefined;
	if (settings.deduplicateTabs) app.workspace.iterateAllLeaves((leaf): void => {
		if (!existing && getGroupType(app, leaf.parent) === GroupType.RootSplit &&
			(!settings.deduplicateSameGroupTabs || leaf.parent === target.group) &&
			getOpenFileOfLeaf(app, leaf)?.path === file.path) existing = leaf;
	});
	const leaf = existing ?? target.placeholder ?? app.workspace.createLeafInParent(target.group as WorkspaceSplit, target.group.children.length);
	target.placeholder = undefined;
	try {
		if (existing) await moveTabsIntoSubgroup(app, [leaf.id], target.group);
		makeLeafNonEphemeral(leaf);
		await leaf.setViewState({ ...tab.viewState, active: false, state: { ...tab.viewState.state, file: file.path } });
		await loadDeferredLeaf(leaf);
		if (app.workspace.getLeafById(leaf.id) !== leaf || getOpenFileOfLeaf(app, leaf)?.path !== file.path ||
			leaf.getViewState().type !== tab.viewState.type) throw new Error(`Could not reopen ${file.path}`);
		makeLeafNonEphemeral(leaf);
		await tabCacheStore.getActions().saveTabMetadata(leaf.id, tab.customization);
		useSubgroups.getState().assign([leaf.id]);
		return leaf;
	} catch (error) {
		if (!existing) leaf.detach();
		throw error;
	}
}

export async function restoreArchiveEntry(app: App, id: string, tabId?: string): Promise<void> {
	await withArchiveAction([`entry:${id}`, `restore:${id}`], async () => {
		const entry = useArchive.getState().data.entries.find((item) => item.id === id);
		if (!entry) return;
		const restoreSubgroup = entry.kind === "subgroup" && tabId === undefined;
		if (restoreSubgroup && useSubgroups.getState().readOnly) throw new Error("Subgroup data is read-only");
		const tabs = entry.kind === "tab" ? [entry] : entry.tabs.filter((tab) => tabId === undefined || tab.id === tabId);
		if (tabId !== undefined && !tabs.length) return;
		const keep = useSettings.getState().keepArchiveAfterRestore;
		await withSubgroupMove(app, async () => {
			let target: RestoreTarget | undefined;
			const restored: { tab: ArchivedTab; leaf: WorkspaceLeaf }[] = [];
			let failed = 0;
			for (const tab of tabs) {
				try {
					const file = app.vault.getAbstractFileByPath(tab.path);
					if (!(file instanceof TFile)) throw new Error(`File not found: ${tab.path}`);
					target ??= getRestoreTarget(app);
					const leaf = await openArchivedTab(app, tab, file, target);
					restored.push({ tab, leaf });
				} catch (error) {
					failed++;
					console.error("[VerticalTabs] Failed to restore an archived tab:", error);
					if (target && !target.group.children.length) target = undefined;
				}
			}
			if (restoreSubgroup && entry.kind === "subgroup" && (restored.length || !tabs.length)) {
				target ??= getRestoreTarget(app);
				const subgroupId = useSubgroups.getState().create(target.group.id, entry.title, restored.map(({ leaf }) => leaf.id));
				if (!subgroupId) throw new Error("Could not restore the subgroup");
				useSubgroups.getState().startEditing(null);
				useSubgroups.getState().setCollapsed(subgroupId, entry.subgroupCollapsed);
				useViewState.getState().toggleCollapsedGroup(target.group.id, false);
			}
			if (!keep && (restored.length || restoreSubgroup && !tabs.length)) consumeRestored(entry, restored.map(({ tab }) => tab.id), restoreSubgroup);
			const active = restored[0]?.leaf;
			if (active) {
				useViewState.getState().toggleHiddenGroup(active.parent.id, false, app);
				app.workspace.setActiveLeaf(active, { focus: true });
			}
			if (failed) new Notice(`Vertical Tabs: ${failed} archive item(s) could not be restored. Their bookmarks have been kept.`);
		});
	});
}

export async function deleteArchiveEntry(app: App, id: string, tabId?: string): Promise<void> {
	await withArchiveAction([`entry:${id}`], async () => {
		const entry = useArchive.getState().data.entries.find((item) => item.id === id);
		if (!entry) return;
		const subgroup = entry.kind === "subgroup" && tabId === undefined;
		const tab = entry.kind === "tab" ? entry : entry.tabs.find((tab) => tab.id === tabId);
		if (!subgroup && !tab) return;
		const settings = useSettings.getState();
		const ask = subgroup ? settings.confirmDeleteArchivedSubgroup : settings.confirmDeleteArchivedTab;
		if (ask && !await confirmAction(app, {
			title: subgroup ? "Delete archived subgroup?" : "Delete archived bookmark?", confirmText: "Delete from archive",
			message: subgroup
				? `Delete “${entry.title}” and all its bookmarks from the archive? Files and open tabs will stay unchanged.`
				: `Delete “${tab?.title ?? entry.title}” from the archive? The file and open tabs will stay unchanged.`,
		})) return;
		if (tabId) useArchive.getState().removeTabs(id, [tabId]);
		else useArchive.getState().remove(id);
	});
}

function consumeRestored(entry: ArchiveEntry, tabIds: string[], entireSubgroup: boolean) {
	if (entry.kind === "tab" || entireSubgroup && tabIds.length === entry.tabs.length) {
		useArchive.getState().remove(entry.id);
	} else {
		useArchive.getState().removeTabs(entry.id, tabIds);
	}
}

export function reportArchiveError(error: unknown) {
	console.error("[VerticalTabs] Archive operation failed:", error);
	new Notice("Vertical Tabs: could not complete the archive action. Saved bookmarks have been kept.");
}

export function addArchiveTabMenu(app: App, menu: Menu, leafIds: string[]) {
	const available = leafIds.some((id) => {
		const leaf = app.workspace.getLeafById(id);
		return leaf && getOpenFileOfLeaf(app, leaf);
	});
	menu.addItem((item) => item.setTitle(leafIds.length > 1 ? "Archive selected file tabs" : "Archive tab")
		.setIcon("archive").setDisabled(useArchive.getState().readOnly || !available)
		.onClick(() => void archiveTabs(app, leafIds).catch(reportArchiveError)));
}
