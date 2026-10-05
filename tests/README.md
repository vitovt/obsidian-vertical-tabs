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
