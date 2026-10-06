export interface NavigationDragData {
	kind: "group" | "subgroup" | "tab" | "tab-slot" | "new-group" | "subgroup-slot";
	groupId?: string;
	subgroupId?: string;
	leafId?: string;
}
