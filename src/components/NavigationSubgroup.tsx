import { Menu } from "obsidian";
import { NavigationTreeItem, NavigationTreeItemProps } from "./NavigationTreeItem";

interface CollapseProps {
	isCollapsed?: boolean;
	collapseDisabled?: boolean;
	onCollapsedChange: (collapsed: boolean) => void;
}

type NavigationSubgroupProps = Omit<NavigationTreeItemProps, "isTab" | "isSubgroup" | "icon" | "onClick"> & CollapseProps;

// Storage and actions belong to the caller; disclosure behavior is shared.
export const NavigationSubgroup = ({ collapseDisabled, onCollapsedChange, ...props }: NavigationSubgroupProps) =>
	<NavigationTreeItem {...props} isTab={false} isSubgroup={true} icon="right-triangle"
		disabled={!!collapseDisabled}
		onClick={() => {
			if (!collapseDisabled && !props.isRenaming) onCollapsedChange(!props.isCollapsed);
		}} />;

export function addSubgroupCollapseMenuItem(menu: Menu, props: CollapseProps) {
	menu.addItem((item) => item.setTitle(props.isCollapsed ? "Expand" : "Collapse").setDisabled(!!props.collapseDisabled)
		.onClick(() => { if (!props.collapseDisabled) props.onCollapsedChange(!props.isCollapsed); }));
}
