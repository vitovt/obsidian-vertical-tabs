import { NavigationTreeItem } from "./NavigationTreeItem";

interface NavigationTabSlotProps {
	id: string;
	groupId: string;
	subgroupId?: string;
	disabled?: boolean;
	asNewTabButton?: boolean;
	onClick?: () => void;
}

export const NavigationTabSlot = ({ id, groupId, subgroupId, disabled, asNewTabButton, onClick }: NavigationTabSlotProps) =>
	<NavigationTreeItem id={id} isTab={true} isTabSlot={true} dragDisabled={disabled}
		dragData={{ kind: "tab-slot", groupId, subgroupId }}
		classNames={{ "as-new-tab-button": !!asNewTabButton }} title={asNewTabButton ? "New tab" : ""}
		icon={asNewTabButton ? "plus" : "slot"} onClick={onClick} />;
