import assert from "node:assert/strict";
import test from "node:test";
import { create } from "zustand";
import { loadModule } from "./subgroup-fixtures.mjs";

test("sorting keeps cached IDs and Shift ranges in the actual native tab order", () => {
	const { DefaultRecord } = loadModule("src/utils/DefaultRecord.ts", {});
	const sorting = loadModule("src/services/SortTabs.ts", {
		"src/models/VTGroupView": {
			identifyGroupViewType: () => "default", GroupViewType: { Default: "default" },
		},
	});
	const { tabCacheStore } = loadModule("src/stores/TabCacheStore.ts", {
		"src/utils/DefaultRecord": { DefaultRecord },
		"../models/VTWorkspace": { GroupType: { RootSplit: "root" } },
		"src/services/SortTabs": sorting,
		"../models/StoreWithActions": { useStoreWithActions: (initializer) => {
			const store = create(initializer);
			store.getActions = () => store.getState().actions;
			return store;
		} },
	});
	const leaves = ["c", "a", "b"].map((id) => ({ id }));
	const group = { children: [...leaves, { id: "ab-hidden" }], currentTab: 0, recomputeChildrenDimensions() {}, selectTab() {} };
	const entry = { group, groupType: "root", leaves, leafIDs: ["c", "a", "b"] };
	tabCacheStore.setState({
		content: new Map([["group", entry]]), leafIDs: entry.leafIDs,
		sortStrategy: { compareFn: (a, b) => a.id.localeCompare(b.id), reverse: false },
	});
	tabCacheStore.getActions().sort();
	assert.equal(group.children.map((leaf) => leaf.id).join(","), "a,ab-hidden,b,c");
	assert.equal(tabCacheStore.getState().content.get("group").leaves.map((leaf) => leaf.id).join(","), "a,b,c");
	assert.equal(tabCacheStore.getState().content.get("group").leafIDs.join(","), "a,b,c");
	assert.equal(tabCacheStore.getState().leafIDs.join(","), "a,b,c");
	const { useTabSelection } = loadModule("src/stores/TabSelectionStore.ts", {
		zustand: { create }, "./TabCacheStore": { tabCacheStore },
	});
	useTabSelection.getState().selectTabRange("a", "c");
	assert.equal([...useTabSelection.getState().selectedTabs].join(","), "a,b,c");
});
