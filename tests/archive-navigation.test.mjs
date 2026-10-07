import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as dnd from "@dnd-kit/core";
import { archivedSubgroup, archivedTab, setupArchive } from "./archive-fixtures.mjs";
import { loadModule } from "./subgroup-fixtures.mjs";

function captureArchive(store, mobile = false) {
	const capture = { sortables: [], nodes: [], rows: new Map(), treeProps: [], menus: new Map(), sensors: [], restores: 0, deletes: 0 };
	const runtime = { ...jsxRuntime, ...Object.fromEntries(["jsx", "jsxs"].map((name) => [name, (type, props, key) => {
		if (typeof type === "string") capture.nodes.push(props);
		if (props.isSubgroup && props.icon) capture.treeProps.push(props);
		if (props.className?.includes("tree-item-self")) capture.rows.set(capture.sortables.at(-1).id, props);
		if (props.onContextMenu && props.className?.includes("tree-item-self")) {
			capture.menus.set(capture.sortables.at(-1).id, props.onContextMenu);
		}
		return jsxRuntime[name](type, props, key);
	}])) };
	const createMenu = () => {
		const menu = { items: [], addSeparator() {}, showAtMouseEvent() { capture.lastMenu = menu; },
			addItem(callback) {
				const item = {
					setTitle(title) { this.title = title; return this; },
					setIcon() { return this; },
					setDisabled(disabled) { this.disabled = disabled; return this; },
					onClick(callback) { this.click = callback; return this; },
					setSubmenu() { this.submenu = createMenu(); return this.submenu; },
				};
				callback(item);
				menu.items.push(item);
			},
		};
		return menu;
	};
	const imports = {
		react: React, "react/jsx-runtime": runtime,
		"react-dom": { createPortal: (child) => child },
		obsidian: { Platform: { isMobile: mobile } },
		"src/utils/CssClasses": { toClassName: (classes) => Object.keys(classes).filter((key) => classes[key]).join(" ") },
		"src/models/PluginContext": { useApp: () => ({}) },
		"@dnd-kit/core": { ...dnd,
			DndContext: ({ children, ...props }) => { capture.context = props; return children; },
			DragOverlay: () => null,
			useSensor: (sensor, options) => { capture.sensors.push({ sensor, options }); return {}; },
			useSensors: (...sensors) => sensors,
			closestCenter: ({ droppableContainers }) => droppableContainers,
		},
		"@dnd-kit/sortable": {
			SortableContext: ({ children }) => children,
			useSortable: (config) => {
				capture.sortables.push(config);
				return { attributes: { "data-sortable-id": config.id }, listeners: { onPointerDown() {} }, setNodeRef() {} };
			},
		},
		"src/services/Menu": { createVTMenu: createMenu },
		"src/services/Archive": {
			restoreArchiveEntry: async () => { capture.restores++; },
			deleteArchiveEntry: async () => { capture.deletes++; },
		},
		"src/stores/ArchiveStore": {
			useArchive: Object.assign((selector) => selector(store.state()), { getState: store.state }),
		},
	};
	imports["./IconButton"] = loadModule("src/components/IconButton.tsx", imports);
	imports["./NavigationTreeItem"] = loadModule("src/components/NavigationTreeItem.tsx", imports);
	imports["./NavigationSubgroup"] = loadModule("src/components/NavigationSubgroup.tsx", imports);
	imports["./NavigationTabSlot"] = loadModule("src/components/NavigationTabSlot.tsx", imports);
	imports["./useNavigationDrag"] = loadModule("src/components/useNavigationDrag.ts", imports);
	const { ArchivePanel } = loadModule("src/components/ArchivePanel.tsx", imports);
	capture.html = renderToStaticMarkup(React.createElement(ArchivePanel));
	capture.drop = (id, target) => capture.context.onDragEnd({
		active: { id: `archive:${id}`, data: { current: capture.sortables.find((item) => item.id === `archive:${id}`).data } },
		over: target === null ? null : { id: target.kind === "tab-slot" ? `archive-slot:${target.subgroupId ?? "root"}` :
			`archive:${target.leafId ?? target.subgroupId}`, data: { current: { groupId: "archive-root", ...target } } },
	});
	capture.menu = (id) => {
		capture.menus.get(`archive:${id}`)({ preventDefault() {}, nativeEvent: {} });
		return capture.lastMenu.items;
	};
	return capture;
}

const renderArchive = (store) => captureArchive(store).html;

test("the archive renders bookmarks, subgroup children and independent delete buttons without native tab indices", () => {
	const store = setupArchive();
	store.state().addMany([archivedTab("standalone", "One.md"), {
		...archivedSubgroup([archivedTab("child", "Two.md")]), collapsed: false,
	}]);
	const html = renderArchive(store);
	assert.match(html, /aria-label="Archive"/);
	for (const id of ["standalone", "subgroup-1", "child"]) assert.match(html, new RegExp(`data-id="${id}"`));
	assert.equal((html.match(/data-action="delete-archive-tab"/g) ?? []).length, 2);
	assert.equal((html.match(/data-action="delete-archive-subgroup"/g) ?? []).length, 1);
	assert.equal(html.includes("data-index="), false);
	assert.equal(html.includes("draggable="), false);
});

test("collapsed archive headers keep the restore control but hide their children", () => {
	const store = setupArchive();
	store.state().add(archivedSubgroup([archivedTab("child", "Two.md")]));
	let html = renderArchive(store);
	assert.match(html, /Restore subgroup in the current group/);
	assert.equal(html.includes('data-id="child"'), false);
	store.state().setCollapsed(true);
	html = renderArchive(store);
	assert.match(html, /aria-expanded="false"/);
	assert.equal(html.includes('data-id="subgroup-1"'), false);
});

test("a restore in progress disables both reopening and removing that record", () => {
	const store = setupArchive();
	store.state().add(archivedTab("one", "One.md"));
	store.state().setBusy("entry:one", true);
	const capture = captureArchive(store);
	assert.match(capture.html, /title="One.md"/);
	assert.equal(capture.rows.get("archive:one")["aria-disabled"], true);
	assert.equal(capture.rows.get("archive:one").onClick, undefined);
	const action = capture.nodes.find((node) => node["data-action"] === "delete-archive-tab");
	assert.equal(action["aria-disabled"], true);
	action.onClick({ stopPropagation() {} });
	assert.equal(capture.restores, 0);
});

test("a protected archive exposes its recovery message without bookmark actions", () => {
	const store = setupArchive("{broken");
	const html = renderArchive(store);
	assert.match(html, /saved archive could not be loaded/);
	assert.equal(html.includes("delete-archive-tab"), false);
});

test("desktop archive rows use the live-tab whole-row activator and shared pointer threshold", () => {
	const store = setupArchive();
	store.state().addMany([archivedTab("root"), archivedSubgroup([])]);
	const capture = captureArchive(store);
	for (const id of ["root", "subgroup-1"]) {
		const row = capture.nodes.find((node) => node["data-sortable-id"] === `archive:${id}`);
		assert.match(row.className, /tree-item-self/);
		assert.equal(typeof row.onPointerDown, "function");
	}
	assert.equal(capture.html.includes("grip-vertical"), false);
	assert.equal(capture.html.includes("move-archive-item"), false);
	assert.equal(capture.sensors.length, 1);
	assert.equal(capture.sensors[0].sensor, dnd.PointerSensor);
	assert.equal(capture.sensors[0].options.activationConstraint.distance, 8);
});

test("mobile archive rows retain the same shared drag handle as live tabs", () => {
	const store = setupArchive();
	store.state().add(archivedTab("root"));
	const capture = captureArchive(store, true);
	const handle = capture.nodes.find((node) => node["data-sortable-id"] === "archive:root");
	assert.equal(handle.className, "drag-handle");
	assert.equal(typeof handle.onPointerDown, "function");
	assert.match(capture.html, /data-action="drag-handle"/);
	assert.equal(capture.html.includes("move-archive-item"), false);
});

test("archive drops use live-tab before-target ordering, subgroup headers and end slots", () => {
	const store = setupArchive();
	store.state().addMany([
		archivedTab("root"),
		{ ...archivedSubgroup([archivedTab("a"), archivedTab("b")], "first"), collapsed: false },
		archivedSubgroup([], "empty"),
	]);
	const capture = captureArchive(store);
	assert.ok(capture.sortables.some((item) => item.id === "archive-slot:root" && item.disabled.draggable));
	assert.ok(capture.sortables.some((item) => item.id === "archive-slot:first" && !item.disabled.droppable));
	capture.drop("root", { kind: "subgroup", subgroupId: "empty" });
	assert.equal(store.state().data.entries[1].tabs[0].id, "root");
	capture.drop("b", { kind: "tab", leafId: "a", subgroupId: "first" });
	assert.equal(store.state().data.entries[0].tabs[0].id, "b");
	capture.drop("a", { kind: "subgroup", subgroupId: "empty" });
	assert.equal(store.state().data.entries[1].tabs.at(-1).id, "a");
	capture.drop("root", { kind: "tab-slot" });
	assert.equal(store.state().data.entries.at(-1).id, "root");
	capture.drop("b", { kind: "tab", leafId: "root" });
	assert.equal(store.state().data.entries.at(-2).id, "b");
	capture.drop("b", { kind: "tab-slot", subgroupId: "first" });
	assert.equal(store.state().data.entries[0].tabs.at(-1).id, "b");
	assert.equal(capture.restores, 0);
	assert.equal(capture.deletes, 0);
});

test("subgroup dragging shares live-tab collision filtering and cannot nest archive subgroups", () => {
	const store = setupArchive();
	store.state().addMany([archivedSubgroup([archivedTab("child")], "first"), archivedSubgroup([], "second")]);
	const capture = captureArchive(store);
	const containers = ["tab", "subgroup", "tab-slot", "subgroup-slot", "group", "new-group"].map((kind) => ({
		data: { current: { kind } },
	}));
	for (const [kind, expected] of [
		["subgroup", ["subgroup", "tab-slot", "group"]],
		["group", ["group", "new-group"]],
		["tab", ["tab", "subgroup", "tab-slot", "group", "new-group"]],
	]) {
		const accepted = capture.context.collisionDetection({ active: { data: { current: { kind } } }, droppableContainers: containers });
		assert.deepEqual(accepted.map((item) => item.data.current.kind), expected);
	}
	capture.drop("second", { kind: "subgroup", subgroupId: "first" });
	assert.equal(store.state().data.entries[0].id, "second");
	capture.drop("second", { kind: "tab-slot" });
	assert.equal(store.state().data.entries.at(-1).id, "second");
	const before = store.state().data;
	const count = store.writes.length;
	capture.drop("second", { kind: "tab", leafId: "child", subgroupId: "first" });
	capture.drop("second", { kind: "subgroup", subgroupId: "second" });
	capture.drop("second", { kind: "subgroup", subgroupId: "first", groupId: "live-workspace" });
	capture.drop("second", null);
	capture.context.onDragCancel();
	assert.equal(store.state().data, before);
	assert.equal(store.writes.length, count);
});

test("context menus reorder and move saved bookmarks without restoring them", () => {
	const store = setupArchive();
	store.state().addMany([
		archivedTab("root"),
		{ ...archivedSubgroup([archivedTab("a"), archivedTab("b")], "first"), collapsed: false },
		archivedSubgroup([], "empty"),
	]);
	let capture = captureArchive(store);
	assert.equal(capture.menu("root").find((item) => item.title === "Move up").disabled, true);
	capture.menu("a").find((item) => item.title === "Move down").click();
	assert.equal(store.state().data.entries[1].tabs[0].id, "b");
	capture = captureArchive(store);
	capture.menu("a").find((item) => item.title === "Move up").click();
	assert.equal(store.state().data.entries[1].tabs[0].id, "a");
	capture.menu("root").find((item) => item.title === "Move to subgroup…").submenu.items
		.find((item) => !item.disabled).click();
	assert.equal(store.state().data.entries[0].tabs.at(-1).id, "root");
	capture = captureArchive(store);
	capture.menu("a").find((item) => item.title === "Move out of subgroup").click();
	assert.equal(store.state().data.entries.at(-1).id, "a");
	assert.equal(capture.restores, 0);
	assert.equal(capture.deletes, 0);
});

test("busy archive entries disable shared sortable rows, slots and menu destinations", () => {
	const store = setupArchive();
	store.state().addMany([archivedTab("root"), {
		...archivedSubgroup([archivedTab("child")]), collapsed: false,
	}]);
	store.state().setBusy("entry:subgroup-1", true);
	const capture = captureArchive(store);
	for (const id of ["archive:subgroup-1", "archive:child", "archive-slot:subgroup-1"]) {
		const config = capture.sortables.find((item) => item.id === id);
		assert.equal(config.disabled.draggable, true);
		assert.equal(config.disabled.droppable, true);
	}
	assert.equal(capture.menu("root").find((item) => item.title === "Move to subgroup…").submenu.items[0].disabled, true);
	const before = store.state().data;
	capture.drop("root", { kind: "subgroup", subgroupId: "subgroup-1" });
	assert.equal(store.state().data, before);
});

for (const mobile of [false, true]) test(`archive subgroup disclosure shares live header behavior on ${mobile ? "mobile" : "desktop"}`, () => {
	const store = setupArchive();
	store.state().add(archivedSubgroup([archivedTab("child")]));
	let capture = captureArchive(store, mobile);
	assert.equal(capture.treeProps.find((props) => props.id === "archive:subgroup-1").icon, "right-triangle");
	assert.equal(capture.html.includes("toggle-archive-subgroup"), false);
	assert.equal(capture.html.includes("vt-archive-title"), false);
	assert.equal(capture.rows.get("archive:subgroup-1")["aria-expanded"], false);
	capture.rows.get("archive:subgroup-1").onClick();
	assert.equal(store.state().data.entries[0].collapsed, false);
	capture = captureArchive(store, mobile);
	assert.match(capture.html, /data-id="child"/);
	assert.equal(capture.rows.get("archive:subgroup-1")["aria-expanded"], true);
	capture.rows.get("archive:subgroup-1").onClick();
	assert.equal(store.state().data.entries[0].collapsed, true);
	assert.equal(capture.restores, 0);
	assert.equal(capture.deletes, 0);
	const restored = setupArchive(store.writes.at(-1));
	assert.equal(restored.state().data.entries[0].collapsed, true);
});

test("archive collapse menus and heading use the shared disclosure without restoring tabs", () => {
	const store = setupArchive();
	store.state().add(archivedSubgroup([archivedTab("child")]));
	let capture = captureArchive(store);
	capture.menu("subgroup-1").find((item) => item.title === "Expand").click();
	assert.equal(store.state().data.entries[0].collapsed, false);
	capture = captureArchive(store);
	capture.menu("subgroup-1").find((item) => item.title === "Collapse").click();
	assert.equal(store.state().data.entries[0].collapsed, true);
	capture.rows.get("").onClick();
	assert.equal(store.state().data.collapsed, true);
	capture = captureArchive(store);
	assert.equal(capture.rows.get("")["aria-expanded"], false);
	assert.equal(capture.html.includes('data-id="subgroup-1"'), false);
	capture.rows.get("").onClick();
	assert.equal(store.state().data.collapsed, false);
	assert.equal(capture.restores, 0);
});

test("shared restore/delete toolbar actions never toggle archived subgroup disclosure", () => {
	const store = setupArchive();
	store.state().add(archivedSubgroup([archivedTab("child")]));
	const capture = captureArchive(store);
	let stopped = 0;
	for (const action of ["restore-archive-subgroup", "delete-archive-subgroup"]) {
		const button = capture.nodes.find((node) => node["data-action"] === action);
		assert.equal(button.role, "button");
		button.onClick({ stopPropagation() { stopped++; } });
	}
	assert.equal(stopped, 2);
	assert.equal(capture.restores, 1);
	assert.equal(capture.deletes, 1);
	assert.equal(store.state().data.entries[0].collapsed, true);
});

test("busy subgroups and read-only archives cannot toggle disclosure or invoke toolbar actions", () => {
	const store = setupArchive();
	store.state().add(archivedSubgroup([archivedTab("child")]));
	store.state().setBusy("entry:subgroup-1", true);
	let capture = captureArchive(store);
	assert.equal(capture.rows.get("archive:subgroup-1").onClick, undefined);
	assert.equal(capture.menu("subgroup-1").find((item) => item.title === "Expand").disabled, true);
	capture.menu("subgroup-1").find((item) => item.title === "Expand").click();
	for (const action of ["restore-archive-subgroup", "delete-archive-subgroup"]) {
		const button = capture.nodes.find((node) => node["data-action"] === action);
		assert.equal(button["aria-disabled"], true);
		button.onClick({ stopPropagation() {} });
	}
	assert.equal(store.state().data.entries[0].collapsed, true);
	assert.equal(capture.restores, 0);
	assert.equal(capture.deletes, 0);
	store.useArchive.setState({ readOnly: true });
	capture = captureArchive(store);
	assert.equal(capture.rows.get("").onClick, undefined);
});

test("shared row and icon controls retain keyboard activation without double actions", () => {
	const store = setupArchive();
	store.state().addMany([archivedTab("root"), archivedSubgroup([])]);
	const capture = captureArchive(store);
	for (const id of ["archive:subgroup-1", "archive:root"]) {
		const row = capture.rows.get(id);
		const target = { click() { row.onClick(); } };
		let prevented = false;
		row.onKeyDown({ key: "Enter", target, currentTarget: target, defaultPrevented: false,
			preventDefault() { prevented = true; } });
		assert.equal(prevented, true);
	}
	assert.equal(store.state().data.entries[1].collapsed, false);
	assert.equal(capture.restores, 1);
	const button = capture.nodes.find((node) => node["data-action"] === "restore-archive-subgroup");
	button.onKeyDown({ key: " ", preventDefault() {}, stopPropagation() {},
		currentTarget: { click() { button.onClick({ stopPropagation() {} }); } } });
	assert.equal(capture.restores, 2);
	assert.equal(store.state().data.entries[1].collapsed, false);
});
