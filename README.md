# PGKL Legacy

League history site for the Pro Glazers Keeper League, built from the public Sleeper API.

```bash
npm install
npm run dev    # local site at http://localhost:5173
npm run sync   # refresh the committed snapshot in public/data/league.json
```

- The **Resync** button in the sidebar re-pulls everything from Sleeper in your browser.
- Rename members (e.g. the 2023 "Former Manager" slots) in `src/members.json`:
  `{ "<sleeper user_id or roster-2023-3>": "Display Name" }`.
- Stat definitions live in `src/lib/stats.ts` and in the ⓘ tooltips.

See `PROMPT.md` for the full build plan.
