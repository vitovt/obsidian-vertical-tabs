import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { archivedSubgroup, archivedTab, setupArchive } from "./archive-fixtures.mjs";
import { loadModule } from "./subgroup-fixtures.mjs";

function renderArchive(store) {
	const imports = {
		react: React, "react/jsx-runtime": jsxRuntime,
		"src/models/PluginContext": { useApp: () => ({}) },
		"src/stores/ArchiveStore": {
			useArchive: Object.assign((selector) => selector(store.state()), { getState: store.state }),
		},
	};
	const { ArchivePanel } = loadModule("src/components/ArchivePanel.tsx", imports);
	return renderToStaticMarkup(React.createElement(ArchivePanel));
}

test("the archive renders bookmarks, subgroup children and independent delete buttons without native tab indices", () => {
	const store = setupArchive();
	store.state().addMany([archivedTab("standalone", "One.md"), {
		...archivedSubgroup([archivedTab("child", "Two.md")]), collapsed: false,
	}]);
	const html = renderArchive(store);
	assert.match(html, /aria-label="Archive"/);
	assert.match(html, /data-archive-id="standalone"/);
	assert.match(html, /data-archive-id="subgroup-1"/);
	assert.match(html, /data-archive-id="child"/);
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
	assert.equal(html.includes('data-archive-id="child"'), false);
	store.state().setCollapsed(true);
	html = renderArchive(store);
	assert.match(html, /aria-expanded="false"/);
	assert.equal(html.includes('data-archive-id="subgroup-1"'), false);
});

test("a restore in progress disables both reopening and removing that record", () => {
	const store = setupArchive();
	store.state().add(archivedTab("one", "One.md"));
	store.state().setBusy("restore:one", true);
	const html = renderArchive(store);
	assert.match(html, /title="One.md" disabled=""/);
	assert.match(html, /title="Delete bookmark from archive" disabled=""/);
});

test("a protected archive exposes its recovery message without bookmark actions", () => {
	const store = setupArchive("{broken");
	const html = renderArchive(store);
	assert.match(html, /saved archive could not be loaded/);
	assert.equal(html.includes("delete-archive-tab"), false);
});
