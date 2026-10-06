import assert from "node:assert/strict";
import test from "node:test";
import { archivedSubgroup, archivedTab, setupArchive } from "./archive-fixtures.mjs";

test("archive entries and collapse states survive a restart without leaf IDs", () => {
	const { state, writes } = setupArchive();
	state().addMany([archivedTab(), archivedSubgroup([archivedTab("tab-2", "Map.canvas")])]);
	state().setCollapsed(true);
	const restored = setupArchive(writes.at(-1));
	assert.equal(restored.state().data.collapsed, true);
	assert.equal(restored.state().data.entries.length, 2);
	assert.equal(restored.state().data.entries[1].tabs[0].path, "Map.canvas");
	assert.equal(restored.state().data.entries[0].viewState.state.mode, "preview");
	assert.equal(restored.state().data.entries[0].viewState.pinned, true);
	assert.equal(restored.state().data.entries[1].collapsed, true);
	assert.equal(restored.writes.length, 0);
});

test("deleting a subgroup or one child affects only the chosen bookmark", () => {
	const { state } = setupArchive();
	state().addMany([archivedTab(), archivedSubgroup([archivedTab("a"), archivedTab("b")])]);
	state().removeTabs("subgroup-1", ["a"]);
	assert.equal(state().data.entries[1].tabs.length, 1);
	assert.equal(state().data.entries[1].tabs[0].id, "b");
	state().removeTabs("subgroup-1", ["b"]);
	assert.equal(state().data.entries.length, 1, "remove the empty parent after its final child is removed");
	state().remove("tab-1");
	assert.equal(state().data.entries.length, 0);
});

test("file and folder renames update paths while keeping custom labels and sibling folders", () => {
	const { state, writes } = setupArchive();
	const plain = { ...archivedTab("plain", "Notes/Plain.md"), customization: {} };
	state().addMany([plain, archivedSubgroup([
		archivedTab("custom", "Notes/One.md"), archivedTab("unrelated", "Notes-other/One.md"),
	])]);
	state().renamePath("Notes", "Moved");
	state().renamePath("Moved/Plain.md", "Moved/Renamed.md");
	const restored = setupArchive(writes.at(-1));
	const [tab, subgroup] = restored.state().data.entries;
	assert.equal(tab.path, "Moved/Renamed.md");
	assert.equal(tab.title, "Renamed");
	assert.equal(subgroup.tabs[0].path, "Moved/One.md");
	assert.equal(subgroup.tabs[0].viewState.state.file, "Moved/One.md");
	assert.equal(subgroup.tabs[0].title, "One");
	assert.equal(subgroup.tabs[1].path, "Notes-other/One.md");
});

test("storage failures leave the previously saved archive unchanged", () => {
	const { state, writes, failWrites, notices } = setupArchive();
	assert.equal(state().add(archivedTab()), true);
	failWrites();
	assert.equal(state().add(archivedSubgroup()), false);
	assert.equal(state().remove("tab-1"), false);
	assert.equal(state().data.entries.length, 1);
	assert.equal(writes.length, 1);
	assert.equal(notices.length, 2);
});

for (const raw of ["{broken", '{"version":2}', JSON.stringify({ version: 1, collapsed: false,
	entries: [archivedTab(), archivedTab()] })]) {
	test(`invalid archive is preserved until an explicit reset: ${raw.slice(0, 30)}`, () => {
		const { state, writes, notices } = setupArchive(raw);
		assert.equal(state().readOnly, true);
		assert.equal(state().add(archivedTab()), false);
		assert.equal(writes.length, 0);
		assert.equal(notices.length, 1);
		assert.equal(state().reset(), true);
		assert.equal(state().readOnly, false);
		assert.equal(state().data.entries.length, 0);
	});
}

test("unchanged collapse and deletion operations do not write", () => {
	const { state, writes } = setupArchive();
	state().add(archivedSubgroup());
	const count = writes.length;
	state().setCollapsed(false);
	state().setEntryCollapsed("subgroup-1", true);
	state().remove("missing");
	state().removeTabs("subgroup-1", ["missing"]);
	state().renamePath("Missing", "Other");
	assert.equal(writes.length, count);
});
