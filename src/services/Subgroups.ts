import { App, Menu, Notice, WorkspaceLeaf, WorkspaceParent } from "obsidian";
import { getLeafSubgroup, getSubgroupOwner, useSubgroups } from "src/stores/SubgroupStore";
import { tabCacheStore } from "src/stores/TabCacheStore";
import { GroupType } from "src/models/VTWorkspace";
import { getGroupTitle } from "./Customization";
import { moveMultipleTabs, moveMultipleTabsToEnd, moveTab, moveTabToEnd } from "./MoveTab";
import { makeLeafNonEphemeral } from "./EphemeralTabs";
import { useSettings } from "src/models/PluginContext";
import { runWithCanSplit } from "./PlatformCanSplit";
import { useViewState } from "src/models/ViewState";

let pendingMoves = 0;

export function reconcileSubgroups(app: App) {
	if (pendingMoves || !app.workspace.layoutReady) return;
	const parents = new Map<string, string>();
	app.workspace.iterateAllLeaves((leaf): void => {
		// A truthy callback result stops Obsidian's traversal of this tree.
		parents.set(leaf.id, leaf.parent.id);
	});
	useSubgroups.getState().reconcile(parents);
}

// Native moves can emit layout-change before membership/ownership is updated.
export async function withSubgroupMove<T>(app: App, operation: () => T | Promise<T>): Promise<T> {
	pendingMoves++;
	try {
		return await operation();
	} finally {
		pendingMoves--;
		reconcileSubgroups(app);
	}
}

export function promoteSubgroupTabs(leaves: WorkspaceLeaf[]) {
	if (useSettings.getState().ephemeralTabs) leaves.forEach(makeLeafNonEphemeral);
}

export async function moveTabsIntoSubgroup(
	app: App,
	leafIds: string[],
	group: WorkspaceParent,
	subgroupId?: string,
	beforeLeafId?: string,
	atEnd = false
): Promise<WorkspaceLeaf[]> {
	if (useSubgroups.getState().readOnly && subgroupId) return [];
	const data = useSubgroups.getState().data;
	if (subgroupId && getSubgroupOwner(data, subgroupId) !== group.id) return [];
	if (beforeLeafId && (leafIds.includes(beforeLeafId) || app.workspace.getLeafById(beforeLeafId)?.parent !== group)) return [];
	return withSubgroupMove(app, () => {
		const leaves = [...new Set(leafIds)].map((id) => app.workspace.getLeafById(id))
			.filter((leaf): leaf is WorkspaceLeaf => !!leaf);
		let moved: WorkspaceLeaf[];
		if (beforeLeafId) {
			const first = leaves[0];
			moved = leaves.length === 1 && first
				? [moveTab(app, first.id, beforeLeafId)].filter((leaf): leaf is WorkspaceLeaf => !!leaf)
				: moveMultipleTabs(app, leaves.map((leaf) => leaf.id), beforeLeafId);
		} else {
			// A header drop only changes membership for leaves already in this group.
			const foreign = leaves.filter((leaf) => leaf.parent !== group);
			const local = leaves.filter((leaf) => leaf.parent === group);
			// Never remove every child only to reinsert it in the same native parent.
			const toMove = atEnd && local.length < group.children.length ? leaves : foreign;
			if (toMove.length === 1 && toMove[0]) moveTabToEnd(app, toMove[0].id, group);
			else if (toMove.length) moveMultipleTabsToEnd(app, toMove.map((leaf) => leaf.id), group);
			moved = leaves.filter((leaf) => leaf.parent === group);
		}
		useSubgroups.getState().assign(moved.map((leaf) => leaf.id), subgroupId);
		promoteSubgroupTabs(moved);
		return moved;
	});
}

export async function moveSubgroupToGroup(app: App, id: string, group: WorkspaceParent, beforeId?: string) {
	const { data, readOnly } = useSubgroups.getState();
	const owner = getSubgroupOwner(data, id);
	if (readOnly || !owner || id === beforeId) return;
	await withSubgroupMove(app, () => {
		if (owner !== group.id) {
			const leaves = Object.entries(data.subgroupByLeaf)
				.filter(([, subgroupId]) => subgroupId === id)
				.map(([leafId]) => app.workspace.getLeafById(leafId))
				.filter((leaf): leaf is WorkspaceLeaf => !!leaf && leaf.parent.id === owner);
			if (leaves.length) moveMultipleTabsToEnd(app, leaves.map((leaf) => leaf.id), group);
			promoteSubgroupTabs(leaves);
		}
		useSubgroups.getState().move(id, group.id, beforeId);
	});
}

export function createSubgroupTab(app: App, group: WorkspaceParent, subgroupId: string) {
	if (useSubgroups.getState().readOnly || getSubgroupOwner(useSubgroups.getState().data, subgroupId) !== group.id) return;
	const leaf = runWithCanSplit(() => app.workspace.getLeaf("split"));
	moveTabToEnd(app, leaf.id, group);
	useSubgroups.getState().assign([leaf.id], subgroupId);
	app.workspace.setActiveLeaf(leaf, { focus: true });
}

export function reportSubgroupError(error: unknown) {
	console.error("[VerticalTabs] Subgroup operation failed:", error);
	new Notice("Vertical Tabs: could not move all tabs. The list has been reconciled with the workspace.");
}

export function addSubgroupTabMenu(app: App, menu: Menu, leafIds: string[]) {
	const leaves = leafIds.map((id) => app.workspace.getLeafById(id)).filter((leaf): leaf is WorkspaceLeaf => !!leaf);
	if (!leaves.length) return;
	const { data, readOnly } = useSubgroups.getState();
	menu.addItem((item) => {
		item.setSection("subgroups").setTitle("Move to subgroup…").setDisabled(readOnly);
		const submenu = item.setSubmenu();
		for (const [groupId, subgroups] of Object.entries(data.subgroupsByGroup)) {
			const content = tabCacheStore.getState().content;
			const entry = content.has(groupId) ? content.get(groupId) : undefined;
			if (!entry?.group || entry.groupType !== GroupType.RootSplit) continue;
			const group = entry.group;
			for (const subgroup of subgroups) {
				submenu.addItem((option) => option.setTitle(`${getGroupTitle(groupId)} / ${subgroup.title}`)
					.onClick(() => void moveTabsIntoSubgroup(app, leafIds, group, subgroup.id).catch(reportSubgroupError)));
			}
		}
	});
	menu.addItem((item) => item.setSection("subgroups").setTitle("Remove from subgroup")
		.setDisabled(readOnly || !leaves.some((leaf) => getLeafSubgroup(data, leaf.id, leaf.parent.id)))
		.onClick(() => useSubgroups.getState().assign(leafIds)));
	const first = leaves[0];
	const sameGroup = !!first && leaves.every((leaf) => leaf.parent === first.parent);
	const content = tabCacheStore.getState().content;
	const isRootGroup = !!first && content.has(first.parent.id) && content.get(first.parent.id).groupType === GroupType.RootSplit;
	menu.addItem((item) => item.setSection("subgroups").setTitle("New subgroup from selection…")
		.setDisabled(readOnly || !sameGroup || !isRootGroup)
		.onClick(() => {
			if (!first) return;
			useViewState.getState().toggleCollapsedGroup(first.parent.id, false);
			useSubgroups.getState().create(first.parent.id, undefined, leafIds);
			promoteSubgroupTabs(leaves);
		}));
}
