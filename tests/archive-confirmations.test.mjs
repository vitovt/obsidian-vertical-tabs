import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./subgroup-fixtures.mjs";
import { archivedSubgroup, archivedTab } from "./archive-fixtures.mjs";
import { setupArchiveService } from "./archive-service-fixtures.mjs";

test("all three confirmation preferences default to off", () => {
	const { DEFAULT_SETTINGS } = loadModule("src/models/PluginSettings.ts", {
		"./TabNavigation": { TabNavigationStrategy: { ObsidianPlus: "obsidian-plus" } },
		"./NewTab": { NewTabButtonPlacement: { GroupToolbar: "group-toolbar" } },
		"src/services/CloseTabs": { TabClosingBehavior: { ActiveRight: "active-right" } },
	});
	assert.equal(DEFAULT_SETTINGS.confirmCloseSubgroup, false);
	assert.equal(DEFAULT_SETTINGS.confirmDeleteArchivedSubgroup, false);
	assert.equal(DEFAULT_SETTINGS.confirmDeleteArchivedTab, false);
});

test("closing several subgroup tabs proceeds immediately by default", async () => {
	const { subgroupService, subgroups, source, app, leaves, confirmations, addLeaf } = setupArchiveService();
	const a = addLeaf("One.md");
	const b = addLeaf();
	const id = subgroups.state().create(source.id, "Work", [a.id, b.id]);
	await subgroupService.requestCloseSubgroup(app, id);
	assert.equal(leaves.has(a.id), false);
	assert.equal(leaves.has(b.id), false);
	assert.equal(confirmations.length, 0);
});

test("the close preference asks only for multiple current members and cancellation preserves them", async () => {
	const { subgroupService, subgroups, source, app, leaves, settings, confirmations, answerConfirmation, addLeaf } = setupArchiveService();
	const a = addLeaf("One.md");
	const b = addLeaf();
	settings.confirmCloseSubgroup = true;
	answerConfirmation(false);
	const id = subgroups.state().create(source.id, "Work", [a.id, b.id]);
	await subgroupService.requestCloseSubgroup(app, id);
	assert.equal(leaves.has(a.id), true);
	assert.equal(leaves.has(b.id), true);
	assert.equal(subgroups.state().data.subgroupsByGroup.source[0].id, id);
	assert.equal(confirmations.length, 1);
	assert.match(confirmations[0].message, /all 2 tabs/);
	const single = subgroups.state().create(source.id, "Single", [a.id]);
	await subgroupService.requestCloseSubgroup(app, single);
	assert.equal(leaves.has(a.id), false);
	assert.equal(confirmations.length, 1, "one member does not prompt even when enabled");
	answerConfirmation(true);
	const c = addLeaf("Three.md");
	subgroups.state().assign([c.id], id);
	await subgroupService.requestCloseSubgroup(app, id);
	assert.equal(leaves.has(b.id), false);
	assert.equal(leaves.has(c.id), false);
	assert.equal(confirmations.length, 2);
});

for (const kind of ["tab", "subgroup", "child"]) {
	test(`archive deletion has an independent confirmation policy: ${kind}`, async () => {
		const { archive, service, app, settings, confirmations, answerConfirmation, files, leaves } = setupArchiveService();
		const entry = kind === "tab" ? archivedTab() : archivedSubgroup([archivedTab("child"), archivedTab("sibling")]);
		archive.state().add(entry);
		const id = entry.id;
		const childId = kind === "child" ? "child" : undefined;
		const key = kind === "subgroup" ? "confirmDeleteArchivedSubgroup" : "confirmDeleteArchivedTab";
		const otherKey = kind === "subgroup" ? "confirmDeleteArchivedTab" : "confirmDeleteArchivedSubgroup";
		const tabCount = leaves.size;
		const fileCount = files.size;
		settings.confirmCloseSubgroup = true;
		settings[otherKey] = true;
		await service.deleteArchiveEntry(app, id, childId);
		assert.equal(confirmations.length, 0, "unrelated confirmation preferences do not prompt");
		archive.state().remove(id);
		archive.state().add(entry);
		settings[key] = true;
		answerConfirmation(false);
		const before = JSON.stringify(archive.state().data);
		await service.deleteArchiveEntry(app, id, childId);
		assert.equal(JSON.stringify(archive.state().data), before);
		assert.equal(confirmations.length, 1);
		answerConfirmation(true);
		await service.deleteArchiveEntry(app, id, childId);
		assert.equal(confirmations.length, 2);
		assert.equal(leaves.size, tabCount);
		assert.equal(files.size, fileCount);
		if (kind === "child") {
			assert.ok(archive.state().data.entries.every((item) => item.tabs.every((tab) => tab.id !== "child")));
		} else assert.equal(archive.state().data.entries.length, 0);
	});
}

test("pending archive deletion blocks repeat deletion and restoration until the decision", async () => {
	const { archive, service, app, settings, target, confirmations, holdConfirmation, addFile } = setupArchiveService();
	addFile("One.md");
	archive.state().add(archivedTab("one", "One.md"));
	settings.confirmDeleteArchivedTab = true;
	const release = holdConfirmation();
	const pending = service.deleteArchiveEntry(app, "one");
	await service.deleteArchiveEntry(app, "one");
	await service.restoreArchiveEntry(app, "one");
	assert.equal(confirmations.length, 1);
	assert.equal(target.children.length, 1);
	assert.equal(archive.state().data.entries.length, 1);
	release(false);
	await pending;
	assert.equal(archive.state().busyIds.length, 0);
	assert.equal(archive.state().data.entries.length, 1);
});

test("archiving and consuming restored bookmarks do not trigger explicit deletion or close prompts", async () => {
	const { archive, subgroups, service, app, settings, source, confirmations, addLeaf } = setupArchiveService();
	settings.confirmCloseSubgroup = true;
	settings.confirmDeleteArchivedSubgroup = true;
	settings.confirmDeleteArchivedTab = true;
	const a = addLeaf("One.md");
	const b = addLeaf("Two.md");
	const id = subgroups.state().create(source.id, "Work", [a.id, b.id]);
	await service.archiveSubgroup(app, id);
	const entry = archive.state().data.entries[0];
	await service.restoreArchiveEntry(app, entry.id);
	assert.equal(confirmations.length, 0);
	assert.equal(archive.state().data.entries.length, 0);
});

test("the confirmation modal resolves Cancel and Escape as false, and its action as true", async () => {
	const modals = [];
	const latest = () => modals.at(-1);
	class Modal {
		constructor() {
			this.titleEl = { setText() {} };
			this.contentEl = { createEl() {}, empty() {} };
			this.buttons = [];
			modals.push(this);
		}
		open() { this.onOpen(); }
		close() { this.onClose(); }
	}
	class Setting {
		addButton(build) {
			const button = {
				setButtonText(text) { this.text = text; return this; },
				setClass() { return this; },
				onClick(callback) { this.click = callback; return this; },
			};
			build(button);
			latest().buttons.push(button);
			return this;
		}
	}
	const { confirmAction } = loadModule("src/views/ConfirmActionModal.ts", { obsidian: { Modal, Setting } });
	const options = { title: "Delete?", message: "Delete a bookmark?", confirmText: "Delete" };
	let pending = confirmAction({}, options);
	latest().buttons.find((button) => button.text === "Cancel").click();
	assert.equal(await pending, false);
	pending = confirmAction({}, options);
	latest().close();
	assert.equal(await pending, false);
	pending = confirmAction({}, options);
	latest().buttons.find((button) => button.text === "Delete").click();
	assert.equal(await pending, true);
});
