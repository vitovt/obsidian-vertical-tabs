import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { setIcon } from "obsidian";
import { DndContext, DragEndEvent, DragOverlay } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { NavigationDragData } from "src/models/NavigationDrag";
import { toClassName } from "src/utils/CssClasses";
import { NavigationTreeItem } from "./NavigationTreeItem";
import { useNavigationDrag } from "./useNavigationDrag";
import { useApp } from "src/models/PluginContext";
import { ArchiveEntry, ArchiveMoveTarget, ArchivedTab, useArchive } from "src/stores/ArchiveStore";
import { deleteArchiveEntry, reportArchiveError, restoreArchiveEntry } from "src/services/Archive";
import { createVTMenu } from "src/services/Menu";

const archiveRoot = "archive-root";
const archiveDragId = (id: string) => `archive:${id}`;

const ArchiveIcon = ({ icon }: { icon: string }) => {
	const ref = useRef<HTMLSpanElement>(null);
	useEffect(() => { if (ref.current) setIcon(ref.current, icon); }, [icon]);
	return <span className="vt-archive-icon" ref={ref} aria-hidden="true" />;
};

interface ArchiveActionProps {
	icon: string;
	label: string;
	action: string;
	disabled: boolean;
	onClick: () => void;
}

const ArchiveAction = ({ icon, label, action, disabled, onClick }: ArchiveActionProps) =>
	<button type="button" className="clickable-icon action-button" data-action={action}
		aria-label={label} title={label} disabled={disabled}
		onClick={(event) => { event.stopPropagation(); onClick(); }}>
		<ArchiveIcon icon={icon} />
	</button>;

export const ArchivePanel = () => {
	const app = useApp();
	const { entries, collapsed } = useArchive((state) => state.data);
	const readOnly = useArchive((state) => state.readOnly);
	const busyIds = useArchive((state) => state.busyIds);
	const restore = (id: string, tabId?: string) => void restoreArchiveEntry(app, id, tabId).catch(reportArchiveError);
	const remove = (id: string, tabId?: string) => void deleteArchiveEntry(app, id, tabId).catch(reportArchiveError);
	const menu = (entry: ArchiveEntry, parentId?: string) => {
		const id = parentId ?? entry.id;
		const disabled = readOnly || busyIds.includes(`entry:${id}`);
		const tabId = parentId ? entry.id : undefined;
		const subgroup = entry.kind === "subgroup";
		const menu = createVTMenu("vt-archive-menu");
		menu.addItem((item) => item.setTitle(subgroup ? "Restore subgroup" : "Open tab").setIcon("archive-restore")
			.setDisabled(disabled).onClick(() => restore(id, tabId)));
		menu.addSeparator();
		const parent = entries.find((item) => item.id === parentId);
		const siblings = parent?.kind === "subgroup" ? parent.tabs : entries;
		const index = siblings.findIndex((item) => item.id === entry.id);
		const move = (target: ArchiveMoveTarget) => { useArchive.getState().move(entry.id, target); };
		menu.addItem((item) => item.setTitle("Move up").setIcon("arrow-up").setDisabled(disabled || index <= 0)
			.onClick(() => move({ subgroupId: parentId, beforeId: siblings[index - 1]?.id })));
		menu.addItem((item) => item.setTitle("Move down").setIcon("arrow-down")
			.setDisabled(disabled || index < 0 || index >= siblings.length - 1)
			.onClick(() => move({ subgroupId: parentId, beforeId: siblings[index + 2]?.id })));
		if (entry.kind === "tab") {
			const subgroups = entries.filter((item) => item.kind === "subgroup" && item.id !== parentId);
			menu.addItem((item) => {
				item.setTitle("Move to subgroup…").setIcon("folder-input").setDisabled(disabled || !subgroups.length);
				const submenu = item.setSubmenu();
				for (const subgroup of subgroups) submenu.addItem((option) => option.setTitle(subgroup.title)
					.setDisabled(disabled || busyIds.includes(`entry:${subgroup.id}`))
					.onClick(() => move({ subgroupId: subgroup.id })));
			});
			if (parentId) menu.addItem((item) => item.setTitle("Move out of subgroup").setIcon("folder-output")
				.setDisabled(disabled).onClick(() => move({})));
		}
		menu.addSeparator();
		menu.addItem((item) => item.setTitle("Delete from archive").setIcon("trash-2").setDisabled(disabled)
			.onClick(() => remove(id, tabId)));
		return menu;
	};
	const handleDragEnd = ({ active, over }: DragEndEvent) => {
		const source = active.data.current as NavigationDragData | undefined;
		const target = over?.data.current as NavigationDragData | undefined;
		if (!source || !target || source.groupId !== archiveRoot || target.groupId !== archiveRoot) return;
		if (source.kind === "subgroup" && source.subgroupId) {
			if (target.kind !== "subgroup" && target.kind !== "tab-slot") return;
			useArchive.getState().move(source.subgroupId, { beforeId: target.subgroupId });
		} else if (source.kind === "tab" && source.leafId) {
			if (target.kind !== "tab" && target.kind !== "subgroup" && target.kind !== "tab-slot") return;
			useArchive.getState().move(source.leafId, {
				subgroupId: target.subgroupId, beforeId: target.kind === "tab" ? target.leafId : undefined,
			});
		}
	};
	const { dragKind, dragProps } = useNavigationDrag(handleDragEnd);
	const renderSlot = (subgroupId?: string, disabled = false) => <NavigationTreeItem
		id={subgroupId ? `archive-slot:${subgroupId}` : "archive-slot:root"}
		title="" icon="slot" isTab={true} isTabSlot={true} dragDisabled={disabled}
		dragData={{ kind: "tab-slot", groupId: archiveRoot, subgroupId }} />;
	const renderTab = (tab: ArchivedTab, parentId?: string) => {
		const id = parentId ?? tab.id;
		const disabled = readOnly || busyIds.includes(`entry:${id}`);
		const open = () => { if (!disabled) restore(id, parentId ? tab.id : undefined); };
		return <NavigationTreeItem key={tab.id} id={archiveDragId(tab.id)} isTab={true} icon={tab.icon}
			dataType="archive-tab" dataId={tab.id} classNames={{ "is-archived-tab": true }}
			dragData={{ kind: "tab", groupId: archiveRoot, leafId: tab.id, subgroupId: parentId }} dragDisabled={disabled}
			onClick={open} onContextMenu={(event) => {
				event.preventDefault();
				menu(tab, parentId).showAtMouseEvent(event.nativeEvent);
			}}
			title={<button type="button" className="vt-archive-title" title={tab.path} disabled={disabled}
				onClick={(event) => { event.stopPropagation(); open(); }}>{tab.title}</button>}
			toolbar={<ArchiveAction icon="trash-2" label="Delete bookmark from archive" action="delete-archive-tab"
				disabled={disabled} onClick={() => remove(id, parentId ? tab.id : undefined)} />} />;
	};
	return <section className={toClassName({
		"vt-archive": true, "is-dragging": !!dragKind, "is-dragging-subgroup": dragKind === "subgroup",
	})} aria-label="Archive">
		<button type="button" className="vt-archive-heading" aria-expanded={!collapsed} disabled={readOnly}
			onClick={() => useArchive.getState().setCollapsed(!collapsed)}>
			<ArchiveIcon icon={collapsed ? "chevron-right" : "chevron-down"} />
			<ArchiveIcon icon="archive" />
			<span>Archive</span><span className="vt-archive-count">{entries.length}</span>
		</button>
		{readOnly && <p className="vt-archive-empty">The saved archive could not be loaded. Use Reset archive in settings to clear it.</p>}
		{!collapsed && !readOnly && <DndContext {...dragProps}>
			<div className="vt-archive-entries">
				{!entries.length && <p className="vt-archive-empty">No archived tabs yet.</p>}
				<SortableContext items={entries.map((entry) => archiveDragId(entry.id))}>
					{entries.map((entry) => {
						if (entry.kind === "tab") return renderTab(entry);
						const disabled = busyIds.includes(`entry:${entry.id}`);
						return <NavigationTreeItem key={entry.id} id={archiveDragId(entry.id)} isTab={false} isSubgroup={true}
							icon="folder" isCollapsed={entry.collapsed} dragDisabled={disabled}
							dataType="archive-subgroup" dataId={entry.id} classNames={{ "is-archived-subgroup": true }}
							dragData={{ kind: "subgroup", groupId: archiveRoot, subgroupId: entry.id }}
							onContextMenu={(event) => {
								event.preventDefault();
								menu(entry).showAtMouseEvent(event.nativeEvent);
							}}
							title={<button type="button" className="vt-archive-title" title="Restore subgroup in the current group"
								disabled={disabled} onClick={() => restore(entry.id)}>{entry.title}</button>}
							toolbar={<>
								<span className="vt-archive-count">{entry.tabs.length}</span>
								<ArchiveAction icon={entry.collapsed ? "chevron-right" : "chevron-down"}
									label={entry.collapsed ? "Expand archived subgroup" : "Collapse archived subgroup"}
									action="toggle-archive-subgroup" disabled={disabled}
									onClick={() => useArchive.getState().setEntryCollapsed(entry.id, !entry.collapsed)} />
								<ArchiveAction icon="trash-2" label="Delete subgroup from archive" action="delete-archive-subgroup"
									disabled={disabled} onClick={() => remove(entry.id)} />
							</>}>
							<SortableContext items={entry.tabs.map((tab) => archiveDragId(tab.id))}>
								{entry.tabs.map((tab) => renderTab(tab, entry.id))}
								{renderSlot(entry.id, disabled)}
							</SortableContext>
						</NavigationTreeItem>;
					})}
					{renderSlot()}
				</SortableContext>
			</div>
			{createPortal(<DragOverlay />, activeDocument.body)}
		</DndContext>}
	</section>;
};
