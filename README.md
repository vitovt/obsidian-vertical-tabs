# Vertical Tabs *for Obsidian*

[Subscribe to the Beta Program](https://ko-fi.com/oxdcq) for exclusive early access to the latest updates!

**Subscription ($2.99/m) is only required to download beta versions. Once installed, you may use it as long as you want.**

<video src="https://github.com/user-attachments/assets/caf6bc43-2ed9-4cb8-887d-a205b2f5fe6a" width="500"></video>

---

To get started with Vertical Tabs, you can take a quick look at the [feature tour](https://vertical-tabs-docs.oxdc.dev/User-Guide/feature-tour) to get a glimpse of all the features. If you want to jump right in and start using Vertical Tabs, the [quick start](https://vertical-tabs-docs.oxdc.dev/User-Guide/quick-start) guide is a good start point.

Productive users of Obsidian often find themselves juggling a large number of open notes, and the default horizontal tab layout can make it challenging to locate and switch between them. As more notes are opened, tabs become narrower, making titles harder to read. This can lead to decreased productivity and increased frustration.

Vertical Tabs offers a solution by introducing a vertical list of tabs, allowing users to [group](https://vertical-tabs-docs.oxdc.dev/Features/tab-groups) and [organize](https://vertical-tabs-docs.oxdc.dev/User-Guide/Basic-Usage/navigation) tabs for more efficient navigation.

## Subgroups

Choose **New subgroup** inside a tab group to organize its tabs without creating
another split pane. Rename or collapse a subgroup from its header. Drag tabs onto
the header, or use **Move to subgroup…** in a tab's context menu; selected tabs
can also form a new subgroup. Drag subgroup headers to reorder them, or move a
subgroup into another existing group to move its tabs with it. Subgroups have
one level of nesting and are saved locally for this vault on this device.

Tabs without a subgroup appear first. Each subgroup shows its tabs in Obsidian's
tab order, so normal sorting still applies across the whole group. Keyboard
indices, Shift selection, and commands that close preceding/following tabs also
use that tab order, including tabs in collapsed subgroups. **Delete subgroup
(keep tabs)** removes the organization while leaving every tab open. Empty
subgroups remain available for reuse. The subgroup's **Close** button removes
the subgroup and closes all its tabs, including pinned and non-file tabs.
**Reset customization** clears subgroups; resetting settings keeps them.

## Archive

Use **Archive** on a file tab or subgroup to save bookmarks in the **Archive**
section below the open tabs, then close the originals. Archiving a subgroup
saves its file tabs in native order and closes all members, including non-file
tabs. Standalone tabs without a file cannot be archived. No vault files are
deleted by archiving, closing, or deleting an archive entry.

Click an archived tab to open it in the current tab group without subgroup
membership. Expand an archived subgroup to open an individual tab, or click its
title to restore the whole subgroup in the current group without adding a split
pane. File view states, pinned status, tab customization, and subgroup collapse
state are restored. Normal sorting and deduplication settings still apply;
when deduplication is enabled, matching open tabs are reused.

By default, successfully restored bookmarks are removed from the archive;
opening one child removes only that bookmark. Enable **Keep restored items in
archive** to reuse them as bookmarks. Missing files and failed restores remain
in the archive. The **Delete from archive** buttons and context-menu actions
remove only bookmarks; they do not close open tabs or delete files.

Drag archived tabs or subgroup headers from anywhere on their row on desktop,
just like open tabs; mobile uses the same drag handle as the main list. Drop a
tab onto a subgroup header (including a collapsed or empty subgroup) to add it
there, onto a tab to insert before it, or onto the end slot to append it. Drop
onto a root tab or the archive end slot to take a tab out of a subgroup.
Context menus also provide **Move up**, **Move down**, **Move to subgroup…**, and
**Move out of subgroup**. Moving bookmarks keeps their saved state and leaves
empty archived subgroups available for reuse.

The archive is saved locally for this vault on this device and survives an
Obsidian restart. File and folder renames in the vault update saved paths.
**Reset archive** clears only bookmarks; **Reset everything** also clears them.
Resetting plugin settings or customization keeps the archive.

Three independent settings can ask for confirmation: **Confirm closing
subgroups** (only for more than one tab), **Confirm deleting archived
subgroups**, and **Confirm deleting archived bookmarks** (including subgroup
children). All are disabled by default. They apply to explicit close/delete
buttons and menu actions; archiving and successful restoration do not prompt.

As *the* workspace manager for Obsidian, Vertical Tabs provides many handy features like [per-tab zooming](https://vertical-tabs-docs.oxdc.dev/Features/per-tab-zooming), [zen mode](https://vertical-tabs-docs.oxdc.dev/Features/zen-mode), [tab history browser](https://vertical-tabs-docs.oxdc.dev/Features/tab-history-browser), and an [extended keyboard tab switcher](https://vertical-tabs-docs.oxdc.dev/Features/extended-keyboard-tab-switcher). Additionally, it supports [advanced tab navigation](https://vertical-tabs-docs.oxdc.dev/Features/advanced-tab-navigation) with customizable presets, such as [IDE mode](https://vertical-tabs-docs.oxdc.dev/User-Guide/Advanced/Tab-Navigation/IDE-mode), which delivers a VSCode-like experience with [ephemeral tabs](https://vertical-tabs-docs.oxdc.dev/Features/ephemeral-tabs) and automatic [tab deduplication](https://vertical-tabs-docs.oxdc.dev/Features/tab-deduplication). Users can also create personalized [tab navigation strategies](https://vertical-tabs-docs.oxdc.dev/User-Guide/Advanced/Tab-Navigation/custom-strategy) for finer control.

<p align="center" style="text-align: center;">
  <a href="https://obsidian.md/plugins?id=vertical-tabs" style="text-decoration: none;">
    <img
      alt="Install"
      src="https://img.shields.io/badge/Install-blue?style=for-the-badge&logo=obsidian&logoColor=white"
      style="display: inline-block;"
    />
  </a>
  <a href="https://vertical-tabs-docs.oxdc.dev" style="text-decoration: none;">
    <img
      alt="Documentation"
      src="https://img.shields.io/badge/Documentation-darkviolet?style=for-the-badge&logo=readthedocs&logoColor=white"
      style="display: inline-block;"
    >
  </a>
  <a href="https://vertical-tabs-docs.oxdc.dev/roadmap" style="text-decoration: none;">
    <img
      alt="Roadmap"
      src="https://img.shields.io/badge/Roadmap-purple?style=for-the-badge&logo=git&logoColor=white"
      style="display: inline-block;"
    >
  </a>
  <a href="https://github.com/oxdc/obsidian-vertical-tabs" style="text-decoration: none;">
    <img
      alt="Github Repo"
      src="https://img.shields.io/badge/GitHub%20Repo-7037C8?style=for-the-badge&logo=GitHub&logoColor=white"
      style="display: inline-block;"
    />
  </a>
  <a href="https://ko-fi.com/oxdcq" style="text-decoration: none;">
    <img
      alt="Support"
      src="https://img.shields.io/badge/Support-orange?style=for-the-badge&logo=ko-fi&logoColor=white"
      style="display: inline-block;"
    />
  </a>
</p>

![Screenshot](./images/hero.png)

