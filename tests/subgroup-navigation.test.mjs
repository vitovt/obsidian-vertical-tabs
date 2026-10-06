import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { loadModule, setup } from "./subgroup-fixtures.mjs";

test("the navigation tree filters native order, preserves indices and renders empty and collapsed headers", () => {
	const store = setup();
	const group = { id: "group" };
	const leaves = ["a", "b", "c", "d"].map((id) => ({ id, parent: group }));
	group.children = [leaves[0], leaves[1], { id: "hidden-service-leaf", parent: group }, leaves[2], leaves[3]];
	const one = store.state().create(group.id, "One", ["a", "c"]);
	const two = store.state().create(group.id, "Two", ["b"]);
	store.state().create(group.id, "Empty");
	store.state().startEditing(null);
	store.state().setCollapsed(two, true);
	const entry = { group, groupType: "root-split", leaves, leafIDs: leaves.map((leaf) => leaf.id) };
	const cacheState = { groupIDs: [group.id], content: new Map([[group.id, entry]]) };
	const cache = Object.assign((selector) => selector(cacheState), {
		getState: () => cacheState, getActions: () => ({}),
	});
	const sortableConfigs = [];
	// SSR normally reads Zustand's initial state; render the hydrated snapshot.
	const renderStore = { ...store, useSubgroups: Object.assign((selector) => selector(store.state()), {
		getState: store.state,
	}) };
	const imports = {
		react: React, "react/jsx-runtime": jsxRuntime,
		obsidian: { Platform: { isMobile: false } },
		"src/stores/SubgroupStore": renderStore,
		"src/stores/TabCacheStore": { tabCacheStore: cache },
		"src/models/PluginContext": {
			useApp: () => ({}),
			useSettings: (selector) => selector({ newTabButtonPlacement: "none" }),
		},
		"src/models/ViewState": { useViewState: (selector) => selector({ latestActiveLeaf: null }) },
		"src/models/NewTab": { NewTabButtonPlacement: { GroupToolbar: "toolbar", Both: "both", TabSlot: "slot" } },
		"src/models/VTWorkspace": { GroupType: { RootSplit: "root-split" } },
		"src/utils/CssClasses": { toClassName: (classes) => Object.keys(classes).filter((key) => classes[key]).join(" ") },
		"@dnd-kit/sortable": {
			SortableContext: ({ children }) => children,
			useSortable: (config) => {
				sortableConfigs.push(config);
				return { attributes: {}, listeners: {}, setNodeRef() {} };
			},
		},
		"@dnd-kit/core": {
			DndContext: ({ children }) => children, DragOverlay: () => null,
			useSensors: () => [], useSensor: () => ({}),
		},
		"react-dom": { createPortal: (child) => child },
		"src/stores/TabSelectionStore": { useTabSelection: () => ({}) },
		"./IconButton": { IconButton: () => null },
		"./Group": { Group: ({ children }) => children(false, "default") },
		"./GroupSlot": { GroupSlot: () => null },
		"./TabSlot": { TabSlot: () => null },
		"./Tab": { Tab: ({ leaf, index, isLast }) => React.createElement("div", {
			"data-leaf": leaf.id, "data-index": index, "data-last": String(isLast),
		}) },
	};
	imports["./NavigationTreeItem"] = loadModule("src/components/NavigationTreeItem.tsx", imports);
	imports["./Subgroup"] = loadModule("src/components/Subgroup.tsx", imports);
	const { NavigationContent } = loadModule("src/components/NavigationContent.tsx", imports);
	const html = renderToStaticMarkup(React.createElement(NavigationContent));
	assert.ok(html.indexOf('data-leaf="d"') < html.indexOf("One"), "ungrouped leaves render first");
	assert.ok(html.indexOf('data-leaf="a"') < html.indexOf('data-leaf="c"'));
	assert.match(html, /data-leaf="c" data-index="4"/);
	assert.match(html, /data-leaf="d" data-index="5" data-last="true"/);
	assert.equal(html.includes('data-leaf="b"'), false, "collapsed membership is not rendered");
	assert.ok(html.includes("Two"));
	assert.ok(html.includes("Empty"));
	assert.ok(html.includes("New subgroup"));
	assert.equal((html.match(/data-leaf="a"/g) ?? []).length, 1);
	const slot = sortableConfigs.find((config) => config.id === `subgroup-slot:${one}`);
	assert.equal(slot.disabled.draggable, true);
	assert.ok(!slot.disabled.droppable, "empty subgroup slots accept drops");
	assert.equal(slot.data.subgroupId, one);
});
