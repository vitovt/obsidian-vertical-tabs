import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";
import { create } from "zustand";

function loadModule(path, imports) {
	const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
	const { code } = transformSync(source, { loader: "ts", format: "cjs" });
	const module = { exports: {} };
	runInNewContext(code, {
		module, exports: module.exports,
		require: (name) => imports[name] ?? {},
		console: { error() {} },
	});
	return module.exports;
}

function setup(raw) {
	let nextId = 0;
	const writes = [];
	const notices = [];
	const store = loadModule("src/stores/SubgroupStore.ts", {
		zustand: { create },
		nanoid: { nanoid: () => `subgroup-${++nextId}` },
		obsidian: { Notice: class { constructor(message) { notices.push(message); } } },
		"src/constants/StorageKeys": { STORAGE_KEYS: { SUBGROUPS: "subgroups" } },
		"./LocalStorageService": { localStorageService: {
			save: (_key, data) => writes.push(JSON.stringify(data)),
		} },
	});
	store.hydrateSubgroups({ loadLocalStorage: () => raw });
	return { ...store, state: () => store.useSubgroups.getState(), writes, notices };
}

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
