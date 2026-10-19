# Build Prompt — League Legacy clone (PGKL)

Build a read-only static website that recreates the functionality of leaguelegacy.io
(reference: https://leaguelegacy.io/leagues/premier-league-4/history) for my fantasy
football league (PGKL). The reference is a sample from a different league — use it only
for features and layout; all data comes from MY league. Use original styling — do not copy their branding,
logos, copy text, or assets.

## Repo & stack
- Clone https://github.com/shubhvir21/LeagueLegacyPGKL.git into this folder and work there.
- Stack is your choice; suggested: Vite + React + TypeScript, a charting lib (e.g. Recharts),
  hash routing so it works on GitHub Pages.
- No backend. `npm run dev` locally; later a GitHub Actions workflow deploys to GitHub Pages.
- Commit after each working feature.

## League format
- **Keeper league:** each manager keeps 2 players per season, kept at the round they were
  drafted in (Sleeper marks these as `is_keeper` on draft picks). Show keepers in draft
  views with a badge; track keeper history per member (who was kept, cost round, how they
  performed). In draft value calculations, value keepers separately from fresh picks.
- Layout: desktop-first for now (responsive enough not to break on mobile).

## Data
- My league has been on **Sleeper since 2023** (2023–present); no other platforms.
- Sleeper: public API (https://docs.sleeper.com), no key. Current league ID:
  `1362926045359013888`. Follow `previous_league_id` back to 2023 to get every season.
  Pull league, users, rosters, matchups (all weeks), winners/losers brackets, drafts + picks,
  transactions, and the NFL players map (cache it; it's large).
- Normalize everything into one schema: seasons → teams → weekly matchups (with starters and
  player points), drafts, transactions, playoff results.
- **Manager identity:** key members by Sleeper `user_id` (stable across seasons); team
  names change per season. Optional `members.json` override for display names.
- Store the snapshot as `public/data/*.json` (committed, so the shared site loads instantly).
  **Resync button**: re-fetches the Sleeper seasons in the browser, recomputes all stats,
  caches to IndexedDB, shows "last synced" time.
- **Auto-refresh:** a scheduled GitHub Action (nightly, plus Tuesday morning after NFL games)
  runs a Node script that re-pulls Sleeper data, rebuilds `public/data/*.json`, commits if
  changed, and redeploys Pages, so the shared link stays current without anyone clicking.
  Share the fetch/compute code between this script and the browser Resync.

## Pages (all read-only)
1. **League Home** – current top 3, recent-activity feed (records broken, badges, results).
2. **History** – All-time standings (seasons, record, win %, all-play record/%, league rating
   (Elo), trophies; sortable; toggle inactive members); Playoff & Advanced standings tabs;
   season-by-season table (champion, 2nd, 3rd, in-season champ, points champ, all-play champ)
   with Chumpions / top ranks / worst ranks tabs; charts over time for league rating, season
   score, points share, final rank, draft/manager/coach rank, SOS, luck.
3. **Matchups (Gamecenter)** – average matchup score by season chart; season + week picker
   with box scores; matchups browsable by category (closest, blowouts, highest scoring…).
4. **Playoffs** – participation grid (member × season, colored by finish); playoff predictors
   (retention rate, does reg-season/points/all-play/draft rank/defending champ predict
   playoffs); appearance streaks; brackets per season.
5. **Draft** – filter by season / franchise; all-time stats (avg pick value, team value);
   top/worst picks all-time; all-time draft rankings by member; pick value vs season rank
   chart; per-position (QB/RB/WR/TE/K/DEF) best & worst picks.
6. **Transactions** – filter by season / franchise; totals (waivers, trades); waiver, trade,
   and overall manager rankings by value; best/worst seasons; top/worst waiver moves;
   most-transacted player/NFL team; top trades.
7. **Players** – top scorer, best avg, best single week, most drafted/added/dropped; top lists
   by position; All-Pro 1st/2nd team by season; searchable player directory with player pages.
8. **Versus** – rivalry highlight cards (closest series, most contested, longest active streak,
   highest scoring game, biggest blowout, most meetings, closest game, most lopsided);
   head-to-head grid; click a cell for full series detail.
9. **Record Book** – categories: League, Season, Matchup, Draft & Transactions, Roster
   Records, Roster Stats, Streaks & Droughts, Milestones; top-25 lists per record; top record
   holders table; recent record breakers; milestone watchers ("X away from 100 wins").
10. **Achievements** – badge system (achievements + blunders, e.g. Double Up, True Lowlight,
    Total Wins 100); member badge totals; recent badges; badges by season chart.
11. **Schedule** – this week / upcoming / completed weekly slates.
12. **Member pages** – summary blurb (generated from stats, no AI needed), medal score,
    championships, Elo, avg points for/against, finish-by-year strip, season-history table
    (record, all-play, points & share, luck, SOS, draft/manager/coach rank, score, rank);
    tabs: teams, matchups, playoffs, draft, transactions, players, achievements, records.
13. **Season pages** – summary, podium, award cards (in-season champ, points champ, all-play
    champ, last place, lowest scorer, worst all-around), standings, plus the same tabs.
14. **Team-season pages** – season score, record, all-play, PF/PA, SOS, luck, draft/manager/
    coach rank and coach score, week-by-week results.

**Skip:** Finances (empty), Commissioner Notes, Rules, Newsletters (AI-written), Hall of Fame
(empty), login/register. These can be static markdown pages later if wanted.

## Metric definitions (document each in-app with an info tooltip)
- All-play: each week, record vs every other team's score.
- Luck: actual wins − expected wins from all-play.
- SOS: average opponent strength.
- Points share: team points ÷ league points.
- League rating: Elo across all matchups, starting at 1500.
- Coach score: actual starter points ÷ optimal lineup points (needs per-player weekly points).
- Draft value / transaction value: player points produced relative to positional replacement
  level; define the formula clearly and keep it consistent.
- Season score: a composite 0–100 of win %, all-play %, points share, and finish.

## Process
1. Look through the reference pages and confirm this feature list before you start.
2. Build in phases and stop for my review at the end of each one:
   - **Phase 1 (MVP):** data layer + identity, History, Season, Team-season, Member, Versus.
     Check the totals against the standings in the Sleeper app.
   - **Phase 2:** Matchups, Playoffs, Record Book.
   - **Phase 3:** Draft (with keepers), Transactions, Players, Achievements, Home/Schedule.
   - **Phase 4:** GitHub Pages deploy + scheduled auto-refresh Action.
