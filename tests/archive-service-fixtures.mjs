import { loadModule, setup } from "./subgroup-fixtures.mjs";
import { setupArchive } from "./archive-fixtures.mjs";

export function setupArchiveService() {
	const archive = setupArchive();
	const subgroups = setup();
	const root = {};
	const source = { id: "source", children: [], getRoot: () => root };
	const target = { id: "target", children: [], getRoot: () => root };
	const files = new Map();
	const leaves = new Map();
	const metadata = new Map();
	const settings = { ephemeralTabs: true, keepArchiveAfterRestore: false,
		confirmCloseSubgroup: false, confirmDeleteArchivedSubgroup: false, confirmDeleteArchivedTab: false };
	const notices = [];
	const confirmations = [];
	let confirmResult = true;
	let confirmGate;
	let subgroupService;
	let nextLeaf = 0;
	let nextBookmark = 0;
	let failPath;
	let openGate;
	class TFile {
		constructor(path) {
			this.path = path;
			this.basename = path.split("/").pop().replace(/\.[^.]+$/, "");
		}
	}
	const obsidian = { TFile, FileView: class {}, Notice: class { constructor(message) { notices.push(message); } } };
	const getTabs = loadModule("src/services/GetTabs.ts", { obsidian });
	const app = { vault: { getAbstractFileByPath: (path) => files.get(path) }, workspace: {
		rootSplit: root, leftSplit: {}, rightSplit: {}, floatingSplit: {}, layoutReady: true,
		getLeafById: (id) => leaves.get(id) ?? null,
		iterateAllLeaves: (callback) => { for (const leaf of leaves.values()) { if (callback(leaf)) break; } },
		onLayoutChange: () => subgroupService?.reconcileSubgroups(app),
		getMostRecentLeaf: () => target.children[0] ?? source.children[0] ?? null,
		getActiveViewOfType: () => ({ leaf: app.workspace.activeLeaf }),
		getLeaf: () => addLeaf(undefined, target),
		createLeafInParent: (group) => addLeaf(undefined, group),
		setActiveLeaf: (leaf) => { app.workspace.activeLeaf = leaf; },
	} };
	function addFile(path) {
		const file = new TFile(path);
		files.set(path, file);
		return file;
	}
	function addLeaf(path, parent = source, id = `leaf-${++nextLeaf}`) {
		if (path && !files.has(path)) addFile(path);
		let viewState = { type: path ? "markdown" : "search", state: path ? { file: path, mode: "source" } : {} };
		const leaf = { id, parent, isEphemeral: true, getIcon: () => "file-text", getRoot: () => root,
			getViewState: () => viewState, view: { getViewType: () => viewState.type },
			loadIfDeferred: async () => {},
			setViewState: async (next) => {
				if (openGate) { const gate = openGate; openGate = undefined; await gate; }
				if (next.state?.file === failPath) throw new Error("Could not open file");
				viewState = next;
				app.workspace.onLayoutChange();
			},
			detach: () => {
				leaf.parent.children = leaf.parent.children.filter((item) => item !== leaf);
				leaves.delete(id);
				app.workspace.onLayoutChange();
			},
		};
		parent.children.push(leaf);
		leaves.set(id, leaf);
		app.workspace.onLayoutChange();
		return leaf;
	}
	const anchor = addLeaf("Existing.md", target, "anchor");
	app.workspace.activeLeaf = anchor;
	const viewState = { latestActiveLeaf: anchor, toggleHiddenGroup() {}, toggleCollapsedGroup() {} };
	const cache = { getState: () => ({ tabMetadata: metadata }), getActions: () => ({
		saveTabMetadata: async (id, value) => metadata.set(id, value),
	}) };
	const imports = {
		obsidian,
		nanoid: { nanoid: () => `bookmark-${++nextBookmark}` },
		"src/stores/ArchiveStore": archive,
		"src/stores/SubgroupStore": subgroups,
		"src/stores/TabCacheStore": { tabCacheStore: cache },
		"src/models/PluginContext": { useSettings: { getState: () => settings } },
		"src/models/ViewState": { useViewState: { getState: () => viewState } },
		"src/models/VTWorkspace": { ...loadModule("src/models/VTWorkspace.ts", {}) },
		"./GetTabs": getTabs,
		"./EphemeralTabs": { makeLeafNonEphemeral: (leaf) => { leaf.isEphemeral = false; } },
		"./LoadDeferredLeaf": { loadDeferredLeaf: async (leaf) => leaf.loadIfDeferred() },
		"./MoveTab": { moveTabToEnd: (_app, id, group) => {
			const leaf = leaves.get(id);
			leaf.parent.children = leaf.parent.children.filter((item) => item !== leaf);
			leaf.parent = group;
			group.children.push(leaf);
			app.workspace.onLayoutChange();
			return leaf;
		} },
		"src/views/ConfirmActionModal": { confirmAction: async (_app, options) => {
			confirmations.push(options);
			return confirmGate ? await confirmGate : confirmResult;
		} },
	};
	subgroupService = loadModule("src/services/Subgroups.ts", imports);
	imports["./Subgroups"] = subgroupService;
	const service = loadModule("src/services/Archive.ts", imports);
	return { archive, subgroups, service, subgroupService, app, source, target, files, leaves, metadata, settings, notices, confirmations, addLeaf, addFile,
		answerConfirmation: (answer) => { confirmResult = answer; },
		holdConfirmation: () => { let release; confirmGate = new Promise((resolve) => { release = resolve; }); return release; },
		failOpen: (path) => { failPath = path; },
		holdNextOpen: () => { let release; openGate = new Promise((resolve) => { release = resolve; }); return release; },
	};
}
