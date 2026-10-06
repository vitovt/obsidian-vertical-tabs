import assert from "node:assert/strict";
import test from "node:test";
import { archivedSubgroup, archivedTab } from "./archive-fixtures.mjs";
import { setupArchiveService } from "./archive-service-fixtures.mjs";

test("archiving file tabs saves snapshots before closing and ignores standalone service tabs", async () => {
	const { archive, service, app, leaves, metadata, addLeaf } = setupArchiveService();
	const file = addLeaf("One.md");
	const search = addLeaf();
	metadata.set(file.id, { title: "Custom name", icon: "star", color: "#123" });
	await service.archiveTabs(app, [file.id, search.id]);
	assert.equal(leaves.has(file.id), false);
	assert.equal(leaves.has(search.id), true);
	assert.equal(archive.state().data.entries.length, 1);
	assert.equal(archive.state().data.entries[0].title, "Custom name");
	assert.equal(archive.state().data.entries[0].viewState.state.mode, "source");
	assert.equal(archive.state().data.entries[0].icon, "star");
});

test("a failed persistent write cancels archiving without closing any tabs", async () => {
	const { archive, service, app, leaves, addLeaf } = setupArchiveService();
	const file = addLeaf("One.md");
	archive.failWrites();
	await service.archiveTabs(app, [file.id]);
	assert.equal(leaves.has(file.id), true);
	assert.equal(archive.state().data.entries.length, 0);
});

test("archiving a subgroup saves files in native order and closes all members including service tabs", async () => {
	const { archive, subgroups, service, app, source, leaves, addLeaf } = setupArchiveService();
	const one = addLeaf("One.md");
	const search = addLeaf();
	const two = addLeaf("Two.pdf");
	const unrelated = addLeaf("Unrelated.md");
	const id = subgroups.state().create(source.id, "Research", [two.id, search.id, one.id]);
	subgroups.state().setCollapsed(id, true);
	await service.archiveSubgroup(app, id);
	assert.equal(subgroups.state().data.subgroupsByGroup.source.length, 0);
	assert.equal(leaves.has(one.id), false);
	assert.equal(leaves.has(two.id), false);
	assert.equal(leaves.has(search.id), false);
	assert.equal(leaves.has(unrelated.id), true);
	const entry = archive.state().data.entries[0];
	assert.equal(entry.title, "Research");
	assert.equal(entry.subgroupCollapsed, true);
	assert.equal(entry.tabs.map((tab) => tab.path).join(","), "One.md,Two.pdf");
});

test("subgroup write failures preserve the header and every file and service member", async () => {
	const { archive, subgroups, service, app, source, leaves, addLeaf } = setupArchiveService();
	const one = addLeaf("One.md");
	const search = addLeaf();
	const id = subgroups.state().create(source.id, "Research", [one.id, search.id]);
	archive.failWrites();
	await service.archiveSubgroup(app, id);
	assert.equal(leaves.has(one.id), true);
	assert.equal(leaves.has(search.id), true);
	assert.equal(subgroups.state().data.subgroupsByGroup.source[0].id, id);
});

test("opening one archived subgroup tab opens it outside subgroups and consumes only that bookmark", async () => {
	const { archive, subgroups, service, app, target, metadata, addFile } = setupArchiveService();
	addFile("One.md");
	addFile("Two.md");
	const existing = subgroups.state().create(target.id, "Existing", ["anchor"]);
	archive.state().add(archivedSubgroup([archivedTab("one", "One.md"), archivedTab("two", "Two.md")]));
	await service.restoreArchiveEntry(app, "subgroup-1", "one");
	const leaf = target.children.at(-1);
	assert.equal(leaf.getViewState().state.file, "One.md");
	assert.equal(leaf.getViewState().state.mode, "preview");
	assert.equal(leaf.getViewState().pinned, true);
	assert.equal(leaf.isEphemeral, false);
	assert.equal(metadata.get(leaf.id).title, "One");
	assert.equal(subgroups.state().data.subgroupByLeaf[leaf.id], undefined);
	assert.equal(subgroups.state().data.subgroupByLeaf.anchor, existing);
	assert.equal(archive.state().data.entries[0].tabs.length, 1);
	assert.equal(archive.state().data.entries[0].tabs[0].id, "two");
});

test("restoring a whole subgroup recreates its members in the current native group and consumes the record", async () => {
	const { archive, subgroups, service, app, target, addFile } = setupArchiveService();
	addFile("One.md");
	addFile("Two.md");
	archive.state().add({ ...archivedSubgroup([archivedTab("one", "One.md"), archivedTab("two", "Two.md")]), subgroupCollapsed: true });
	await service.restoreArchiveEntry(app, "subgroup-1");
	const subgroup = subgroups.state().data.subgroupsByGroup.target[0];
	assert.equal(subgroup.title, "Research");
	assert.equal(subgroup.collapsed, true);
	assert.equal(target.children.slice(1).map((leaf) => leaf.getViewState().state.file).join(","), "One.md,Two.md");
	for (const leaf of target.children.slice(1)) assert.equal(subgroups.state().data.subgroupByLeaf[leaf.id], subgroup.id);
	assert.equal(subgroups.state().editingId, null);
	assert.equal(archive.state().data.entries.length, 0);
});

test("the keep-after-restore preference retains both tab and subgroup bookmarks", async () => {
	const { archive, service, app, settings, addFile } = setupArchiveService();
	settings.keepArchiveAfterRestore = true;
	addFile("One.md");
	archive.state().addMany([archivedTab("one", "One.md"), archivedSubgroup([archivedTab("two", "One.md")])]);
	await service.restoreArchiveEntry(app, "one");
	await service.restoreArchiveEntry(app, "subgroup-1");
	assert.equal(archive.state().data.entries.length, 2);
	assert.equal(archive.state().data.entries[1].tabs.length, 1);
});

test("partial restore keeps failed and missing bookmarks and groups only successful tabs", async () => {
	const { archive, subgroups, service, app, target, notices, addFile, failOpen } = setupArchiveService();
	addFile("One.md");
	addFile("Failed.md");
	failOpen("Failed.md");
	archive.state().add(archivedSubgroup([
		archivedTab("one", "One.md"), archivedTab("missing", "Missing.md"), archivedTab("failed", "Failed.md"),
	]));
	await service.restoreArchiveEntry(app, "subgroup-1");
	assert.equal(target.children.length, 2, "the failed new leaf is detached");
	const subgroup = subgroups.state().data.subgroupsByGroup.target[0];
	assert.equal(subgroups.state().data.subgroupByLeaf[target.children[1].id], subgroup.id);
	assert.equal(archive.state().data.entries[0].tabs.map((tab) => tab.id).join(","), "missing,failed");
	assert.equal(notices.length, 1);
});

test("a missing standalone file leaves the bookmark and workspace unchanged", async () => {
	const { archive, service, app, target } = setupArchiveService();
	archive.state().add(archivedTab());
	await service.restoreArchiveEntry(app, "tab-1");
	assert.equal(target.children.length, 1);
	assert.equal(archive.state().data.entries.length, 1);
});

test("restoration reuses an existing local file tab when deduplication is enabled", async () => {
	const { archive, subgroups, service, app, target, settings, addLeaf } = setupArchiveService();
	const existing = addLeaf("One.md", target);
	settings.deduplicateTabs = true;
	settings.deduplicateSameGroupTabs = true;
	const oldGroup = subgroups.state().create(target.id, "Old", [existing.id]);
	archive.state().add(archivedSubgroup([archivedTab("one", "One.md"), archivedTab("duplicate", "One.md")]));
	await service.restoreArchiveEntry(app, "subgroup-1");
	assert.equal(target.children.length, 2, "restoration does not create duplicate native leaves");
	const restoredGroup = subgroups.state().data.subgroupsByGroup.target.find((entry) => entry.id !== oldGroup);
	assert.equal(subgroups.state().data.subgroupByLeaf[existing.id], restoredGroup.id);
	assert.equal(archive.state().data.entries.length, 0);
});

test("global deduplication restores a foreign file tab into the current group", async () => {
	const { archive, subgroups, service, app, source, target, settings, addLeaf } = setupArchiveService();
	const existing = addLeaf("One.md", source);
	settings.deduplicateTabs = true;
	settings.deduplicateSameGroupTabs = false;
	subgroups.state().create(source.id, "Old", [existing.id]);
	archive.state().add(archivedTab("one", "One.md"));
	await service.restoreArchiveEntry(app, "one");
	assert.equal(existing.parent, target);
	assert.equal(target.children.length, 2);
	assert.equal(subgroups.state().data.subgroupByLeaf[existing.id], undefined);
	assert.equal(archive.state().data.entries.length, 0);
});

test("empty and service-only subgroups archive and restore as empty synthetic groups", async () => {
	const { archive, subgroups, service, app, source, target, leaves, addLeaf } = setupArchiveService();
	const search = addLeaf();
	const id = subgroups.state().create(source.id, "Empty after archiving", [search.id]);
	await service.archiveSubgroup(app, id);
	assert.equal(leaves.has(search.id), false);
	const entry = archive.state().data.entries[0];
	assert.equal(entry.tabs.length, 0);
	await service.restoreArchiveEntry(app, entry.id);
	assert.equal(subgroups.state().data.subgroupsByGroup.target[0].title, "Empty after archiving");
	assert.equal(target.children.length, 1);
	assert.equal(archive.state().data.entries.length, 0);
});

test("repeated clicks cannot restore the same record concurrently", async () => {
	const { archive, service, app, target, addFile, holdNextOpen } = setupArchiveService();
	addFile("One.md");
	archive.state().add(archivedTab("one", "One.md"));
	const release = holdNextOpen();
	const pending = service.restoreArchiveEntry(app, "one");
	await service.restoreArchiveEntry(app, "one");
	assert.equal(target.children.length, 2);
	assert.equal(archive.state().busyIds.includes("restore:one"), true);
	release();
	await pending;
	assert.equal(archive.state().busyIds.length, 0);
	assert.equal(archive.state().data.entries.length, 0);
});
