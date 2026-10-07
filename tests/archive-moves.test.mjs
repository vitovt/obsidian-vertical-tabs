import assert from "node:assert/strict";
import test from "node:test";
import { archivedSubgroup, archivedTab, setupArchive } from "./archive-fixtures.mjs";

const ids = (items) => Array.from(items, (item) => item.id);

function setup() {
	const store = setupArchive();
	store.state().addMany([
		archivedTab("one"),
		archivedSubgroup([archivedTab("a"), archivedTab("b"), archivedTab("c")], "first"),
		archivedTab("two"),
		archivedSubgroup([archivedTab("d")], "second"),
	]);
	return store;
}

test("root tabs and entire subgroups can move before siblings or to the end", () => {
	const { state } = setup();
	const first = state().data.entries[1];
	assert.equal(state().move("two", { beforeId: "one" }), true);
	assert.deepEqual(ids(state().data.entries), ["two", "one", "first", "second"]);
	assert.equal(state().move("first", {}), true);
	assert.deepEqual(ids(state().data.entries), ["two", "one", "second", "first"]);
	assert.equal(state().data.entries.at(-1), first, "subgroup state and its children travel together");
});

test("tabs reorder within a subgroup while preserving the saved tab objects", () => {
	const { state } = setup();
	const before = state().data.entries[1];
	state().move("c", { subgroupId: "first", beforeId: "a" });
	assert.deepEqual(ids(state().data.entries[1].tabs), ["c", "a", "b"]);
	state().move("a", { subgroupId: "first" });
	const after = state().data.entries[1];
	assert.deepEqual(ids(after.tabs), ["c", "b", "a"]);
	assert.equal(after.tabs.at(-1), before.tabs[0]);
	assert.equal(after.collapsed, before.collapsed);
	assert.equal(after.subgroupCollapsed, before.subgroupCollapsed);
});

test("standalone tabs move into collapsed subgroups at an exact child position", () => {
	const { state } = setup();
	const tab = state().data.entries[0];
	assert.equal(state().move("one", { subgroupId: "first", beforeId: "b" }), true);
	assert.deepEqual(ids(state().data.entries), ["first", "two", "second"]);
	assert.deepEqual(ids(state().data.entries[0].tabs), ["a", "one", "b", "c"]);
	assert.equal(state().data.entries[0].tabs[1], tab);
	assert.equal(state().data.entries[0].collapsed, true);
});

test("tabs move between subgroups and out to the root without losing empty parents", () => {
	const { state } = setup();
	state().move("d", { subgroupId: "first", beforeId: "a" });
	assert.deepEqual(ids(state().data.entries[1].tabs), ["d", "a", "b", "c"]);
	assert.deepEqual(ids(state().data.entries[3].tabs), []);
	state().move("d", { beforeId: "first" });
	assert.deepEqual(ids(state().data.entries), ["one", "d", "first", "two", "second"]);
	state().move("a", {});
	assert.equal(state().data.entries.at(-1).id, "a");
	state().move("b", { subgroupId: "second" });
	assert.deepEqual(ids(state().data.entries.find((entry) => entry.id === "second").tabs), ["b"]);
});

test("manual order, membership, view states and customization survive rehydration", () => {
	const { state, writes } = setup();
	state().move("one", { subgroupId: "second", beforeId: "d" });
	state().move("a", { beforeId: "first" });
	state().move("second", { beforeId: "first" });
	const saved = JSON.stringify(state().data);
	const restored = setupArchive(writes.at(-1));
	assert.equal(restored.state().readOnly, false);
	assert.deepEqual(JSON.parse(JSON.stringify(restored.state().data)), JSON.parse(saved));
	assert.deepEqual(ids(restored.state().data.entries), ["a", "second", "first", "two"]);
	const [one, d] = restored.state().data.entries[1].tabs;
	assert.equal(one.viewState.pinned, true);
	assert.equal(one.viewState.state.mode, "preview");
	assert.equal(one.customization.color, "#abc");
	assert.equal(one.path, d.path, "different bookmarks for the same file remain distinct");
});

test("no-op moves preserve the state reference and do not write to storage", () => {
	const { state, writes } = setup();
	const before = state().data;
	const count = writes.length;
	for (const [id, target] of [
		["one", { beforeId: "one" }],
		["one", { beforeId: "first" }],
		["second", {}],
		["a", { subgroupId: "first", beforeId: "a" }],
		["b", { subgroupId: "first", beforeId: "c" }],
		["c", { subgroupId: "first" }],
	]) assert.equal(state().move(id, target), true);
	assert.equal(state().data, before);
	assert.equal(writes.length, count);
});

test("invalid destinations and subgroup nesting cannot remove or duplicate bookmarks", () => {
	const { state, writes } = setup();
	const before = state().data;
	const count = writes.length;
	for (const [id, target] of [
		["missing", {}],
		["one", { subgroupId: "missing" }],
		["one", { subgroupId: "two" }],
		["first", { subgroupId: "second" }],
		["first", { subgroupId: "first" }],
		["one", { beforeId: "b" }],
		["one", { subgroupId: "second", beforeId: "b" }],
	]) assert.equal(state().move(id, target), false);
	assert.equal(state().data, before);
	assert.equal(writes.length, count);
});

test("busy source entries and destination subgroups reject moves during restore or deletion", () => {
	const { state, writes } = setup();
	const before = state().data;
	const count = writes.length;
	state().setBusy("entry:one", true);
	assert.equal(state().move("one", {}), false);
	state().setBusy("entry:one", false);
	state().setBusy("entry:first", true);
	assert.equal(state().move("a", {}), false);
	assert.equal(state().move("first", {}), false);
	assert.equal(state().move("one", { subgroupId: "first" }), false);
	state().setBusy("entry:first", false);
	state().setBusy("entry:second", true);
	assert.equal(state().move("a", { subgroupId: "second" }), false);
	assert.equal(state().data, before);
	assert.equal(writes.length, count);
});

test("a failed persistent write leaves membership and order intact", () => {
	const { state, writes, failWrites, notices } = setup();
	const before = state().data;
	const count = writes.length;
	failWrites();
	assert.equal(state().move("a", { subgroupId: "second" }), false);
	assert.equal(state().data, before);
	assert.equal(writes.length, count);
	assert.equal(notices.length, 1);
});

test("read-only archives reject moves without writing", () => {
	const store = setup();
	const before = store.state().data;
	const count = store.writes.length;
	store.useArchive.setState({ readOnly: true });
	assert.equal(store.state().move("one", { subgroupId: "first" }), false);
	assert.equal(store.state().data, before);
	assert.equal(store.writes.length, count);
});
