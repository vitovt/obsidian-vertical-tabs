import { ReactNode, useEffect, useState } from "react";
import { WorkspaceParent } from "obsidian";
import { useApp, useSettings } from "src/models/PluginContext";
import { Subgroup as SubgroupModel, useSubgroups } from "src/stores/SubgroupStore";
import { useViewState } from "src/models/ViewState";
import { createVTMenu } from "src/services/Menu";
import { requestCloseSubgroup, createSubgroupTab, moveSubgroupToGroup, reportSubgroupError } from "src/services/Subgroups";
import { tabCacheStore } from "src/stores/TabCacheStore";
import { GroupType } from "src/models/VTWorkspace";
import { getGroupTitle } from "src/services/Customization";
import { NewTabButtonPlacement } from "src/models/NewTab";
import { NavigationTreeItem } from "./NavigationTreeItem";
import { IconButton } from "./IconButton";
import { useArchive } from "src/stores/ArchiveStore";
import { archiveSubgroup, reportArchiveError } from "src/services/Archive";

export const subgroupDragId = (id: string) => `subgroup:${id}`;

interface SubgroupProps {
	subgroup: SubgroupModel;
	group: WorkspaceParent;
	children: ReactNode;
}

export const Subgroup = ({ subgroup, group, children }: SubgroupProps) => {
	const app = useApp();
	const editing = useSubgroups((state) => state.editingId === subgroup.id);
	const readOnly = useSubgroups((state) => state.readOnly);
	const archiveDisabled = useArchive((state) => state.readOnly || state.busyIds.includes(`archive-subgroup:${subgroup.id}`));
	const activeId = useViewState((state) => state.latestActiveLeaf?.id);
	const containsActive = useSubgroups((state) => !!activeId && state.data.subgroupByLeaf[activeId] === subgroup.id);
	const placement = useSettings((state) => state.newTabButtonPlacement);
	const alwaysOpenInNewTab = useSettings((state) => state.alwaysOpenInNewTab);
	const [draft, setDraft] = useState(subgroup.title);
	useEffect(() => {
		if (editing) setDraft(subgroup.title);
	}, [editing, subgroup.title]);
	const commit = () => {
		// Read the live editing ID so Escape followed by blur cannot commit.
		if (useSubgroups.getState().editingId === subgroup.id) useSubgroups.getState().rename(subgroup.id, draft);
	};
	const startEditing = () => useSubgroups.getState().startEditing(subgroup.id);
	const createTab = () => createSubgroupTab(app, group, subgroup.id);
	const close = () => void requestCloseSubgroup(app, subgroup.id).catch(reportSubgroupError);
	const archive = () => void archiveSubgroup(app, subgroup.id).catch(reportArchiveError);
	const showToolbarTab = !alwaysOpenInNewTab &&
		(placement === NewTabButtonPlacement.GroupToolbar || placement === NewTabButtonPlacement.Both);
	const showSlotTab = !alwaysOpenInNewTab &&
		(placement === NewTabButtonPlacement.TabSlot || placement === NewTabButtonPlacement.Both);
	const buildMenu = () => {
		const menu = createVTMenu("vt-subgroup-menu");
		menu.addItem((item) => item.setTitle("Rename").setDisabled(readOnly).onClick(startEditing));
		menu.addItem((item) => item.setTitle(subgroup.collapsed ? "Expand" : "Collapse").setDisabled(readOnly)
			.onClick(() => useSubgroups.getState().setCollapsed(subgroup.id, !subgroup.collapsed)));
		menu.addItem((item) => item.setTitle("New tab").setDisabled(readOnly).onClick(createTab));
		menu.addItem((item) => {
			item.setTitle("Move subgroup to…").setDisabled(readOnly);
			const submenu = item.setSubmenu();
			for (const entry of tabCacheStore.getState().content.values()) {
				const target = entry.group;
				if (!target || target === group || entry.groupType !== GroupType.RootSplit) continue;
				submenu.addItem((option) => option.setTitle(getGroupTitle(target.id))
					.onClick(() => void moveSubgroupToGroup(app, subgroup.id, target).catch(reportSubgroupError)));
			}
		});
		menu.addSeparator();
		menu.addItem((item) => item.setTitle("Archive subgroup").setIcon("archive").setDisabled(readOnly || archiveDisabled)
			.onClick(archive));
		menu.addItem((item) => item.setTitle("Close subgroup and all tabs").setIcon("x").setDisabled(readOnly)
			.onClick(close));
		menu.addItem((item) => item.setTitle("Delete subgroup (keep tabs)").setDisabled(readOnly)
			.onClick(() => useSubgroups.getState().remove(subgroup.id)));
		return menu;
	};
	return (
		<NavigationTreeItem
			id={subgroupDragId(subgroup.id)} isTab={false} isSubgroup={true}
			dragData={{ kind: "subgroup", groupId: group.id, subgroupId: subgroup.id }}
			dragDisabled={readOnly} isRenaming={editing} isCollapsed={subgroup.collapsed}
			isActiveGroup={containsActive} icon="right-triangle"
			title={editing ? <input autoFocus value={draft}
				onChange={(event) => setDraft(event.target.value)} onFocus={(event) => event.target.select()}
				onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}
				onBlur={commit} onKeyDown={(event) => {
					event.stopPropagation();
					if (event.key === "Enter") commit();
					if (event.key === "Escape") useSubgroups.getState().startEditing(null);
				}} /> : subgroup.title}
			onClick={() => { if (!editing) useSubgroups.getState().setCollapsed(subgroup.id, !subgroup.collapsed); }}
			onDoubleClick={() => { if (!readOnly) startEditing(); }}
			onContextMenu={(event) => buildMenu().showAtMouseEvent(event.nativeEvent)}
			toolbar={!editing && <>
				<IconButton icon="archive" action="archive" tooltip="Archive file tabs and close subgroup"
					disabled={readOnly || archiveDisabled} onClick={archive} />
				{showToolbarTab && <IconButton icon="plus" action="new-tab" tooltip="New tab" disabled={readOnly} onClick={createTab} />}
				<IconButton icon="pencil" action="edit" tooltip="Rename subgroup" disabled={readOnly} onClick={startEditing} />
				<IconButton icon="x" action="close" tooltip="Close subgroup and all tabs" disabled={readOnly} onClick={close} />
			</>}
		>
			{children}
			<NavigationTreeItem id={`subgroup-slot:${subgroup.id}`} isTab={true} isTabSlot={true}
				dragData={{ kind: "tab-slot", groupId: group.id, subgroupId: subgroup.id }}
				classNames={{ "as-new-tab-button": showSlotTab }} title={showSlotTab ? "New tab" : ""}
				icon={showSlotTab ? "plus" : "slot"} onClick={() => { if (showSlotTab) createTab(); }} />
		</NavigationTreeItem>
	);
};
