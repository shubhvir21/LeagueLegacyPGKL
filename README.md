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
- Management metrics (src/lib/management.ts) rebuild each week's optimal lineup from roster points:
  lineup efficiency, bench points, lineup-cost losses, plus Coach and Manager scores.
- Transaction values are value over replacement: started-week points minus a replacement-level
  player at that position (QB/DEF bars are higher because they're easy to stream).
- Playoff odds (src/lib/odds.ts) simulate every starter from Sleeper projections scored with league settings
  (byes, injuries, waiver fill-ins, same-NFL-team correlation). `npm run sync` refits the model from league
  history (src/lib/model.ts) and backtests past seasons to choose the roster-vs-scoring blend.
- Stat definitions live in `src/lib/stats.ts` and in the ⓘ tooltips.

See `PROMPT.md` for the full build plan.

## Deploy

GitHub Actions (`.github/workflows/deploy.yml`) builds and publishes to GitHub Pages on every
push to `main`. It also runs nightly and Tuesday mornings to re-sync from Sleeper, commit the new
snapshot, and redeploy. Trigger it manually from the repo's **Actions → Sync & Deploy → Run workflow**.
