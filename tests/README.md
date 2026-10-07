Run `npm ci`, then `npm test` for the subgroup, typing, and active-tab scrolling regressions.
The tests run the TypeScript source with fake Obsidian events, DOM rectangles,
timers, and animation frames; they check work counts, not browser frame times.

To verify performance in Obsidian:

1. Enable scrollable tabs and preview (ephemeral) tabs, and open enough notes to
   overflow a tab strip.
2. Record a Chrome DevTools Performance trace while typing continuously for
   roughly 18 seconds. The first edit should make a preview tab permanent;
   subsequent edits should not scroll or update its preview state again.
3. Switch to a visible tab, then an offscreen tab. Only the offscreen tab should
   scroll into view. Rapidly switch tabs and check that only the last activation
   produces a delayed scroll.
4. Repeat with stacked tabs, a hidden horizontal tab strip, and a popout window.
   Disable the plugin while a scroll is pending and check that it is cancelled.

Compare callback counts, layout time, and tasks over 16.7 ms against the original
trace under the same settings and workspace. Automated tests cannot establish
the resulting frame times in a live Obsidian workspace.

Subgroup tests exercise membership persistence, invalid-record recovery,
external tab movement, interrupted transfers, native sorting, and server
rendering of the real navigation tree. The workspace iterator reproduces
Obsidian's early exit on truthy callback results, and regressions cover sequential
additions to one subgroup and simultaneous membership in several subgroups.
They exercise both the move adapter and the real native end-move code with fake
workspace objects; these tests do not prove compatibility with a running
Obsidian workspace.

Archive storage tests cover restart persistence, individual bookmark removal,
file and folder renames, invalid saved records, and failed writes. Archive
updates are published only after the persistent write succeeds.
Archive service tests cover mixed file/service subgroups, partial restores,
current-group placement, deduplication, repeat clicks, and both retention modes.
Archive rendering tests cover shared subgroup disclosure and toolbar actions,
collapse persistence, and independent bookmark/subgroup delete controls without
registering native tab indices. Archive moves use a separate drag context from
open tabs; move tests cover ordering, subgroup
membership, empty parents, restart persistence, busy entries, and failed writes.

To verify subgroups in Obsidian:

1. Create three subgroups and rename them. Add several tabs one at a time to each
   of the first two, using both drag-and-drop and `Move to subgroup...`, and leave
   the third empty. Confirm earlier members stay in place when adding a tab to
   either populated subgroup. Collapse a subgroup and confirm its active tab
   stays open in the same pane.
2. Sort the real group, then drag a tab onto a subgroup header and before another
   tab. Check that membership survives sorting and indices still follow the native
   tab order. Repeat with multiple selected tabs and a collapsed target.
3. Move tabs and an entire subgroup between existing groups. Include the last
   tabs of the source group, an empty subgroup, and a popout window.
4. Open, close, and move tabs using Obsidian's horizontal strip. External moves
   should clear old membership; reusing a tab for another file should keep it.
5. Restart Obsidian with the same workspace, then disable/re-enable the plugin.
   Check restored names, membership, header order, and collapse state, including
   two leaves showing the same file.
6. Delete a subgroup and verify all its tabs stay open. Repeat on mobile with
   drag handles and context menus, with the single-group header hidden, and with
   auto-uncollapse, Zen mode, and alternate group views enabled.

To verify the archive in Obsidian:

Compare archived and live subgroup headers: clicking the title, triangle, or
background must toggle disclosure with the same arrow rotation and indentation.
Restore/delete toolbar actions must not toggle disclosure. Check keyboard and
mobile activation, busy records, and persistence after restart.

1. Archive a Markdown tab, Canvas, and PDF, including a pinned and deferred tab.
   Confirm tabs close and bookmarks appear below open groups. Restart Obsidian
   and check that archive entries and collapse states survive.
2. Archive a subgroup containing files and a search tab. Confirm all its members
   close, only the file bookmarks appear in the archive, and other tabs stay open.
3. Click one archived subgroup child. Confirm it opens in the current group
   outside any subgroup and only that child is consumed. Use the remaining
   subgroup's restore button and confirm it restores together without creating
   a split.
4. Enable Keep restored items in archive and repeat with a tab and subgroup.
   Test with deduplication on and off, and restore into another current group.
   Repeat with sidebar/popout deduplication and Always open in new tab enabled.
5. Rename a file and its containing folder while the plugin is enabled, then
   reopen its bookmark. Delete a file or disable its viewer plugin and confirm
   failed bookmarks stay available while successful siblings restore.
6. Delete individual archive bookmarks and whole archived subgroups with the
   buttons and menus. Confirm neither files nor already open tabs are changed.
   Repeat on mobile, with an empty archive, and with the archive collapsed.
7. Enable each confirmation preference separately and try its button and menu
   action. Cancel with the button and Escape and confirm no tabs or bookmarks
   change. Accept and check only the requested action completes. Closing an
   empty or one-tab subgroup should not prompt; archive deletion preferences
   should not add prompts to successful restoration or archiving.
8. Drag archive bookmarks from their title, icon, or row background on desktop,
   just like open tabs. On mobile, use the same shared handle as the main list.
   Drop onto a tab to insert before it and onto subgroup/end slots to append.
   Drop onto expanded, collapsed, and empty subgroup headers, then move tabs
   between subgroups. Drop onto a root tab or the archive end slot to move a
   child out. Reorder subgroup headers too, and check empty source subgroups
   stay available. Verify dragging does not restore or delete bookmarks.
9. Repeat using Move up/down, Move to subgroup, and Move out of subgroup in
   context menus. Cancel a drag with Escape and confirm nothing changes.
   Restart and check order and membership, then restore the moved bookmarks
   and verify their saved view state and customization. Try moving during a
   pending restore/delete; busy entries and subgroups should reject the move.
