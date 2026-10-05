import assert from "node:assert/strict";
import test from "node:test";
import { loadModule, setup } from "./subgroup-fixtures.mjs";

test("membership and header order survive hydration without storing tab order", () => {
	const first = setup();
	const one = first.state().create("group", "One", ["a", "c"]);
	const two = first.state().create("group", "Two", ["b"]);
	first.state().setCollapsed(one, true);
	first.state().move(two, "group", one);
	const restored = setup(first.writes.at(-1));
	assert.equal(restored.state().data.subgroupsByGroup.group[0].id, two);
	assert.equal(restored.state().data.subgroupsByGroup.group[1].collapsed, true);
	assert.equal(restored.getLeafSubgroup(restored.state().data, "c", "group"), one);
	assert.equal(restored.getLeafSubgroup(restored.state().data, "c", "other"), undefined);
	assert.equal("leafIds" in restored.state().data.subgroupsByGroup.group[1], false);
	assert.equal(restored.writes.length, 0);
});

test("assignment replaces membership and subgroup deletion leaves other tabs intact", () => {
	const { state } = setup();
	const one = state().create("group", "One", ["a", "b"]);
	const two = state().create("group", "Two", ["c"]);
	state().assign(["b"], two);
	state().remove(one);
	assert.equal(state().data.subgroupByLeaf.a, undefined);
	assert.equal(state().data.subgroupByLeaf.b, two);
	assert.equal(state().data.subgroupByLeaf.c, two);
	state().assign(["b", "c"]);
	assert.equal(Object.keys(state().data.subgroupByLeaf).length, 0);
	assert.equal(state().data.subgroupsByGroup.group.length, 1);
});

test("reconciliation removes closed and externally moved leaves but keeps empty headers", () => {
	const { state, writes } = setup();
	const id = state().create("group", "Empty later", ["closed", "moved", "kept"]);
	state().reconcile(new Map([["moved", "other"], ["kept", "group"]]));
	assert.equal(state().data.subgroupByLeaf.closed, undefined);
	assert.equal(state().data.subgroupByLeaf.moved, undefined);
	assert.equal(state().data.subgroupByLeaf.kept, id);
	const count = writes.length;
	state().reconcile(new Map([["kept", "group"]]));
	state().setCollapsed(id, false);
	state().assign(["kept"], id);
	assert.equal(writes.length, count, "unchanged refresh and activation do not write");
	state().reconcile(new Map());
	assert.equal(state().data.subgroupsByGroup.group.length, 1);
});

test("moving a header preserves identity, membership and collapse state", () => {
	const { state } = setup();
	const id = state().create("source", "Work", ["a", "b"]);
	state().setCollapsed(id, true);
	state().move(id, "target");
	state().reconcile(new Map([["a", "target"], ["b", "target"]]));
	assert.equal(state().data.subgroupsByGroup.source.length, 0);
	assert.equal(state().data.subgroupsByGroup.target[0].title, "Work");
	assert.equal(state().data.subgroupsByGroup.target[0].collapsed, true);
	assert.equal(state().data.subgroupByLeaf.a, id);
});

for (const raw of ['{"version":2}', '{broken', '{"version":1,"subgroupsByGroup":{},"subgroupByLeaf":[]}']) {
	test(`invalid saved data stays read-only until explicit reset: ${raw}`, () => {
		const { state, writes, notices } = setup(raw);
		assert.equal(state().readOnly, true);
		assert.equal(state().create("group"), null);
		state().reconcile(new Map());
		assert.equal(writes.length, 0);
		assert.equal(notices.length, 1);
		state().reset();
		assert.equal(state().readOnly, false);
		assert.equal(state().create("group") !== null, true);
	});
}

test("renaming trims whitespace and retains the name for empty input", () => {
	const { state } = setup();
	const id = state().create("group", "Original");
	state().rename(id, "  Updated  ");
	state().rename(id, "  ");
	assert.equal(state().data.subgroupsByGroup.group[0].title, "Updated");
});

function setupMoves(realNativeMoves = false) {
	const store = setup();
	const source = { id: "source", children: [] };
	const target = { id: "target", children: [] };
	const leaves = new Map();
	for (const parent of [source, target]) {
		parent.selectTabIndex = () => {};
		parent.selectTab = () => {};
		parent.recomputeChildrenDimensions = () => {};
		parent.detach = () => { parent.detached = true; };
	}
	for (const [id, parent] of [["a", source], ["b", source], ["c", target]]) {
		const leaf = { id, parent };
		leaf.setParent = (nextParent) => { leaf.parent = nextParent; };
		leaf.getEphemeralState = () => ({});
		leaf.setEphemeralState = () => {};
		parent.children.push(leaf);
		leaves.set(id, leaf);
	}
	const nativeCalls = [];
	const app = { workspace: {
		layoutReady: true,
		getLeafById: (id) => leaves.get(id) ?? null,
		iterateAllLeaves: (callback) => leaves.forEach(callback),
		onLayoutChange: () => service.reconcileSubgroups(app),
	} };
	let service;
	let failAfterFirst = false;
	function move(ids, parent, beforeId) {
		nativeCalls.push([...ids]);
		const moved = [];
		for (const id of ids) {
			const leaf = leaves.get(id);
			leaf.parent.children = leaf.parent.children.filter((entry) => entry !== leaf);
			leaf.parent = parent;
			const index = beforeId ? parent.children.findIndex((entry) => entry.id === beforeId) : -1;
			parent.children.splice(index < 0 ? parent.children.length : index, 0, leaf);
			moved.push(leaf);
			service.reconcileSubgroups(app); // Synchronous native layout-change.
			if (failAfterFirst) throw new Error("native move interrupted");
		}
		return moved;
	}
	const nativeMoves = realNativeMoves ? loadModule("src/services/MoveTab.ts", {
		"src/stores/TabCacheStore": { tabCacheStore: { getState: () => ({ groupIDs: [source.id, target.id] }) } },
		"src/constants/Timeouts": { REFRESH_TIMEOUT_LONG: 100 },
	}, { window: { setTimeout: (callback) => callback() } }) : {
		moveTabToEnd: (_app, id, parent) => move([id], parent)[0],
		moveMultipleTabsToEnd: (_app, ids, parent) => move(ids, parent),
		moveTab: (_app, id, targetId) => move([id], leaves.get(targetId).parent, targetId)[0],
		moveMultipleTabs: (_app, ids, targetId) => move(ids, leaves.get(targetId).parent, targetId),
	};
	service = loadModule("src/services/Subgroups.ts", {
		"src/stores/SubgroupStore": store,
		"src/models/PluginContext": { useSettings: { getState: () => ({ ephemeralTabs: false }) } },
		"./MoveTab": nativeMoves,
	});
	return { ...store, service, app, source, target, nativeCalls, leaves,
		fail: () => { failAfterFirst = true; } };
}

test("a header drop in the same parent changes membership without any native move", async () => {
	const { state, service, app, source, nativeCalls } = setupMoves();
	const id = state().create(source.id);
	await service.moveTabsIntoSubgroup(app, ["a", "b"], source, id);
	assert.equal(nativeCalls.length, 0, "even the last leaves must not be detached and reinserted");
	assert.equal(source.children.length, 2);
	assert.equal(state().data.subgroupByLeaf.a, id);
	assert.equal(state().data.subgroupByLeaf.b, id);
});

test("the real native end-move transfers the final subgroup leaves and detaches only the source parent", async () => {
	const { state, service, app, source, target } = setupMoves(true);
	const id = state().create(source.id, "Work", ["b", "a"]);
	await service.moveSubgroupToGroup(app, id, target);
	assert.equal(source.children.length, 0);
	assert.equal(source.detached, true);
	assert.equal(target.detached, undefined);
	assert.equal(target.children.map((leaf) => leaf.id).join(","), "c,a,b");
	assert.equal(state().data.subgroupByLeaf.a, id);
	assert.equal(state().data.subgroupByLeaf.b, id);
});

test("cross-group drop moves only foreign leaves and protects membership during layout events", async () => {
	const { state, service, app, target, nativeCalls } = setupMoves();
	const id = state().create(target.id);
	await service.moveTabsIntoSubgroup(app, ["a", "b", "c"], target, id);
	assert.equal(JSON.stringify(nativeCalls), '[["a","b"]]');
	for (const leaf of target.children) assert.equal(state().data.subgroupByLeaf[leaf.id], id);
});

test("whole-subgroup transfer reuses native movement and keeps the subgroup intact", async () => {
	const { state, service, app, source, target, nativeCalls } = setupMoves();
	const id = state().create(source.id, "Work", ["a", "b"]);
	state().setCollapsed(id, true);
	await service.moveSubgroupToGroup(app, id, target);
	assert.equal(source.children.length, 0);
	assert.equal(nativeCalls.length, 1);
	assert.equal(state().data.subgroupsByGroup.target[0].collapsed, true);
	assert.equal(state().data.subgroupByLeaf.a, id);
	assert.equal(state().data.subgroupByLeaf.b, id);
});

test("empty header transfers do not invoke native movement", async () => {
	const { state, service, app, source, target, nativeCalls } = setupMoves();
	const id = state().create(source.id);
	await service.moveSubgroupToGroup(app, id, target);
	assert.equal(nativeCalls.length, 0);
	assert.equal(state().data.subgroupsByGroup.target[0].id, id);
});

test("partial transfer failure keeps remaining membership and exposes moved tabs ungrouped", async () => {
	const { state, service, app, source, target, fail } = setupMoves();
	const id = state().create(source.id, "Work", ["a", "b"]);
	fail();
	await assert.rejects(service.moveSubgroupToGroup(app, id, target));
	assert.equal(state().data.subgroupByLeaf.a, undefined);
	assert.equal(state().data.subgroupByLeaf.b, id);
	assert.equal(state().data.subgroupsByGroup.source[0].id, id);
});

test("refresh before layout-ready leaves saved membership untouched", () => {
	const { state, service, app, source } = setupMoves();
	const id = state().create(source.id, "Work", ["not-yet-loaded"]);
	app.workspace.layoutReady = false;
	service.reconcileSubgroups(app);
	assert.equal(state().data.subgroupByLeaf["not-yet-loaded"], id);
	app.workspace.layoutReady = true;
	service.reconcileSubgroups(app);
	assert.equal(state().data.subgroupByLeaf["not-yet-loaded"], undefined);
});

test("native sorting changes filtered order without changing membership or writing subgroup data", () => {
	const { state, source, writes, getLeafSubgroup } = setupMoves();
	const id = state().create(source.id, "Work", ["a", "b"]);
	const count = writes.length;
	source.children.reverse();
	const filtered = source.children.filter((leaf) => getLeafSubgroup(state().data, leaf.id, source.id) === id);
	assert.equal(filtered.map((leaf) => leaf.id).join(","), "b,a");
	assert.equal(writes.length, count);
});

test("the group end slot retains native reorder behavior without detaching the last leaves", async () => {
	const { state, service, app, source, nativeCalls } = setupMoves();
	const id = state().create(source.id, "Work", ["a", "b"]);
	await service.moveTabsIntoSubgroup(app, ["a"], source, id, undefined, true);
	assert.equal(source.children.map((leaf) => leaf.id).join(","), "b,a");
	assert.equal(nativeCalls.length, 1);
	await service.moveTabsIntoSubgroup(app, ["a", "b"], source, id, undefined, true);
	assert.equal(nativeCalls.length, 1);
});
