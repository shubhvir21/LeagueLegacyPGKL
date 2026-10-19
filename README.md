# PGKL Legacy

League history site for the Pro Glazers Keeper League, built from the public Sleeper API.

```bash
npm install
npm run dev    # local site at http://localhost:5173
npm run sync   # refresh the committed snapshot in public/data/league.json
```

- The **Resync** button in the sidebar re-pulls everything from Sleeper in your browser.
- Rename members or merge franchise takeovers in `src/members.json`:
  `names: { id: "Display Name" }`, `merge: { oldOwnerId: newOwnerId }`.
- Keepers are detected automatically (same team + same round as last year, or undrafted last year).
  Add any misses to `src/keepers.json`: `{ "2025": ["<sleeper player_id>"] }`.
- Draft value = player points minus a replacement-level player at his position (floored at 0);
  surplus = value minus the average for that round. Transaction values use starting-lineup points.
- Stat definitions live in `src/lib/stats.ts` and in the ⓘ tooltips.

See `PROMPT.md` for the full build plan.

## Deploy

GitHub Actions (`.github/workflows/deploy.yml`) builds and publishes to GitHub Pages on every
push to `main`. It also runs nightly and Tuesday mornings to re-sync from Sleeper, commit the new
snapshot, and redeploy. Trigger it manually from the repo's **Actions → Sync & Deploy → Run workflow**.
