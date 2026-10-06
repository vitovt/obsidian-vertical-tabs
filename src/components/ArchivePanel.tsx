import { useEffect, useRef } from "react";
import { setIcon } from "obsidian";
import { useApp } from "src/models/PluginContext";
import { ArchivedTab, useArchive } from "src/stores/ArchiveStore";
import { reportArchiveError, restoreArchiveEntry } from "src/services/Archive";
import { createVTMenu } from "src/services/Menu";

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
	const remove = (id: string, tabId?: string) => {
		if (readOnly || useArchive.getState().busyIds.includes(`restore:${id}`)) return;
		if (tabId) useArchive.getState().removeTabs(id, [tabId]);
		else useArchive.getState().remove(id);
	};
	const menu = (id: string, tabId: string | undefined, disabled: boolean, subgroup = false) => {
		const menu = createVTMenu("vt-archive-menu");
		menu.addItem((item) => item.setTitle(subgroup ? "Restore subgroup" : "Open tab").setIcon("archive-restore")
			.setDisabled(disabled).onClick(() => restore(id, tabId)));
		menu.addItem((item) => item.setTitle("Delete from archive").setIcon("trash-2").setDisabled(disabled)
			.onClick(() => remove(id, tabId)));
		return menu;
	};
	const renderTab = (tab: ArchivedTab, parentId?: string) => {
		const id = parentId ?? tab.id;
		const disabled = readOnly || busyIds.includes(`restore:${id}`);
		return <div key={tab.id} className="tree-item is-tab is-archived-tab" data-archive-id={tab.id}>
			<div className="tree-item-self" onContextMenu={(event) => {
				event.preventDefault();
				menu(id, parentId ? tab.id : undefined, disabled).showAtMouseEvent(event.nativeEvent);
			}}>
				<ArchiveIcon icon={tab.icon} />
				<button type="button" className="vt-archive-title" title={tab.path} disabled={disabled}
					onClick={() => restore(id, parentId ? tab.id : undefined)}>{tab.title}</button>
				<div className="tree-item-flair-outer">
					<ArchiveAction icon="trash-2" label="Delete bookmark from archive" action="delete-archive-tab"
						disabled={disabled} onClick={() => remove(id, parentId ? tab.id : undefined)} />
				</div>
			</div>
		</div>;
	};
	return <section className="vt-archive" aria-label="Archive">
		<button type="button" className="vt-archive-heading" aria-expanded={!collapsed} disabled={readOnly}
			onClick={() => useArchive.getState().setCollapsed(!collapsed)}>
			<ArchiveIcon icon={collapsed ? "chevron-right" : "chevron-down"} />
			<ArchiveIcon icon="archive" />
			<span>Archive</span><span className="vt-archive-count">{entries.length}</span>
		</button>
		{readOnly && <p className="vt-archive-empty">The saved archive could not be loaded. Use Reset archive in settings to clear it.</p>}
		{!collapsed && !readOnly && <div className="vt-archive-entries">
			{!entries.length && <p className="vt-archive-empty">No archived tabs yet.</p>}
			{entries.map((entry) => {
				if (entry.kind === "tab") return renderTab(entry);
				const disabled = busyIds.includes(`restore:${entry.id}`);
				return <div key={entry.id} className={`tree-item is-group is-archived-subgroup${entry.collapsed ? " is-collapsed" : ""}`}
					data-archive-id={entry.id}>
					<div className="tree-item-self" onContextMenu={(event) => {
						event.preventDefault();
						menu(entry.id, undefined, disabled, true).showAtMouseEvent(event.nativeEvent);
					}}>
						<ArchiveAction icon={entry.collapsed ? "chevron-right" : "chevron-down"}
							label={entry.collapsed ? "Expand archived subgroup" : "Collapse archived subgroup"}
							action="toggle-archive-subgroup" disabled={disabled}
							onClick={() => useArchive.getState().setEntryCollapsed(entry.id, !entry.collapsed)} />
						<button type="button" className="vt-archive-title" title="Restore subgroup in the current group"
							disabled={disabled} onClick={() => restore(entry.id)}>{entry.title}</button>
						<span className="vt-archive-count">{entry.tabs.length}</span>
						<div className="tree-item-flair-outer">
							<ArchiveAction icon="trash-2" label="Delete subgroup from archive" action="delete-archive-subgroup"
								disabled={disabled} onClick={() => remove(entry.id)} />
						</div>
					</div>
					{!entry.collapsed && <div className="tree-item-children">{entry.tabs.map((tab) => renderTab(tab, entry.id))}</div>}
				</div>;
			})}
		</div>}
	</section>;
};
