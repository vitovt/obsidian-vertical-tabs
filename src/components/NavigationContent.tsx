import { tabCacheStore } from "src/stores/TabCacheStore";
import { Tab } from "./Tab";
import { Group } from "./Group";
import { Subgroup, subgroupDragId } from "./Subgroup";
import { DndContext, DragEndEvent, DragOverlay } from "@dnd-kit/core";
import { useApp } from "src/models/PluginContext";
import { toClassName } from "src/utils/CssClasses";
import { SortableContext } from "@dnd-kit/sortable";
import { createPortal } from "react-dom";
import { moveMultipleTabsToNewGroup, moveTabToNewGroup } from "src/services/MoveTab";
import { GroupSlot } from "./GroupSlot";
import { GroupType } from "src/models/VTWorkspace";
import { WorkspaceLeaf } from "obsidian";
import { TabSlot } from "./TabSlot";
import { useTabSelection } from "src/stores/TabSelectionStore";
import { getLeafSubgroup, useSubgroups } from "src/stores/SubgroupStore";
import { NavigationDragData } from "src/models/NavigationDrag";
import {
	moveSubgroupToGroup, moveTabsIntoSubgroup, promoteSubgroupTabs,
	reportSubgroupError, withSubgroupMove,
} from "src/services/Subgroups";
import { NavigationTreeItem } from "./NavigationTreeItem";
import { ArchivePanel } from "./ArchivePanel";
import { useNavigationDrag } from "./useNavigationDrag";

export const NavigationContent = () => {
	const groupIDs = tabCacheStore((state) => state.groupIDs);
	const content = tabCacheStore((state) => state.content);
	const { moveGroupBefore, moveGroupToEnd, refresh } = tabCacheStore.getActions();
	const { getSelectedTabs, isTabSelected, clearTabSelection } = useTabSelection();
	const subgroupData = useSubgroups((state) => state.data);
	const readOnly = useSubgroups((state) => state.readOnly);
	const app = useApp();
	const handleDragEnd = async (event: DragEndEvent) => {
		const { active, over } = event;
		if (!over || active.id === over.id) return;
		const source = active.data.current as NavigationDragData | undefined;
		const target = over.data.current as NavigationDragData | undefined;
		if (!source || !target) return;
		const targetLeaf = target.kind === "tab" ? app.workspace.getLeafById(String(over.id)) : null;
		const targetGroupId = targetLeaf?.parent.id ?? target.groupId;
		const targetGroup = targetLeaf?.parent ?? (targetGroupId ? content.get(targetGroupId).group : null);
		try {
			if (source.kind === "group") {
				if (target.kind === "new-group") moveGroupToEnd(String(active.id));
				else if (targetGroupId) moveGroupBefore(String(active.id), targetGroupId);
				return;
			}
			if (source.kind === "subgroup") {
				if (!source.subgroupId || !targetGroup || target.kind === "new-group") return;
				if (target.subgroupId === source.subgroupId || !targetGroupId || content.get(targetGroupId).groupType !== GroupType.RootSplit) return;
				await moveSubgroupToGroup(app, source.subgroupId, targetGroup,
					target.subgroupId);
				return;
			}
			if (source.kind !== "tab") return;
			const id = String(active.id);
			const selected = getSelectedTabs();
			const ids = selected.length > 1 && isTabSelected(id) ? selected : [id];
			let moved: WorkspaceLeaf[] = [];
			if (target.kind === "new-group") {
				moved = await withSubgroupMove(app, async () => {
					const first = ids[0];
					const leaves = ids.length === 1 && first
						? [await moveTabToNewGroup(app, first)].filter((leaf): leaf is WorkspaceLeaf => !!leaf)
						: await moveMultipleTabsToNewGroup(app, ids);
					useSubgroups.getState().assign([...ids, ...leaves.map((leaf) => leaf.id)]);
					promoteSubgroupTabs(leaves);
					return leaves;
				});
			} else if (targetGroup) {
				const subgroupId = targetLeaf
					? getLeafSubgroup(useSubgroups.getState().data, targetLeaf.id, targetGroup.id)
					: target.subgroupId;
				moved = await moveTabsIntoSubgroup(app, ids, targetGroup, subgroupId, targetLeaf?.id, target.kind === "tab-slot");
			}
			if (moved.length && ids.length > 1) clearTabSelection();
		} catch (error) {
			reportSubgroupError(error);
		} finally {
			refresh(app);
		}
	};

	const { dragKind, dragProps } = useNavigationDrag(handleDragEnd);

	return (
		<div className={toClassName({
			"obsidian-vertical-tabs-container": true,
			"is-dragging-group": dragKind === "group",
			"is-dragging-subgroup": dragKind === "subgroup",
		})}>
			<div className={toClassName({ "is-dragging": !!dragKind })}>
				<DndContext {...dragProps}>
					<SortableContext items={[...groupIDs, "slot-new"]}>
						{groupIDs.map((groupID) => {
							const entry = content.get(groupID);
							const group = entry.group;
							const nativeIndices = new Map(group?.children.map((leaf, index) => [leaf.id, index + 1]));
							const subgroups = entry.groupType === GroupType.RootSplit && group
								? subgroupData.subgroupsByGroup[group.id] ?? [] : [];
							const membership = new Map(entry.leaves.map((leaf) => [leaf.id,
								group && entry.groupType === GroupType.RootSplit
									? getLeafSubgroup(subgroupData, leaf.id, group.id) : undefined]));
							return <Group key={groupID} type={entry.groupType} group={group}>
								{(isSingleGroup, viewType) => {
									const renderTabs = (subgroupId?: string) => entry.leaves.map((leaf, index) => {
										const nativeIndex = entry.groupType === GroupType.RootSplit ? nativeIndices.get(leaf.id) ?? index + 1 : index + 1;
										return membership.get(leaf.id) === subgroupId ? <Tab key={leaf.id} leaf={leaf}
											index={nativeIndex} isLast={entry.groupType === GroupType.RootSplit && group
												? nativeIndex === group.children.length : index === entry.leaves.length - 1}
											isSingleGroup={isSingleGroup} viewType={viewType} /> : null;
									});
									return <>
										<SortableContext items={entry.leafIDs}>
											{renderTabs()}
											<SortableContext items={subgroups.map((subgroup) => subgroupDragId(subgroup.id))}>
												{group && subgroups.map((subgroup) => <Subgroup key={subgroup.id} subgroup={subgroup} group={group}>
													<SortableContext items={entry.leafIDs.filter((id) => membership.get(id) === subgroup.id)}>
														{renderTabs(subgroup.id)}
													</SortableContext>
												</Subgroup>)}
											</SortableContext>
											<TabSlot group={group} groupID={groupID} />
										</SortableContext>
										{group && entry.groupType === GroupType.RootSplit && <NavigationTreeItem
											id={`new-subgroup:${group.id}`} title="New subgroup" icon="plus" isTab={true}
											isTabSlot={true} classNames={{ "as-new-tab-button": true, "is-new-subgroup": true }}
											dragData={{ kind: "subgroup-slot", groupId: group.id }} dragDisabled={true}
											onClick={() => { if (!readOnly) useSubgroups.getState().create(group.id); }} />}
									</>;
								}}
							</Group>;
						})}
						<GroupSlot />
					</SortableContext>
					{createPortal(<DragOverlay />, activeDocument.body)}
				</DndContext>
			</div>
			<ArchivePanel />
		</div>
	);
};
