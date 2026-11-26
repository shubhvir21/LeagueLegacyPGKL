# Playoff odds with a week in progress

**Problem:** the playoff simulation only counts weeks in which every team has finished scoring, so Thursday's results do not move the odds until Tuesday.

**Approach**
- `PartialWeek` (odds.ts): for the in-progress week, each team has `fixed` (points already scored) plus one entry per starter with games still to play (expected remaining points, spread scaled by the share of the game left, NFL team index for correlation).
- `simulate` plays that week from those per-player draws (same-team correlation `rho`, leftover team noise scaled by how much is unplayed) instead of the generic lineup plan. Other weeks are unchanged.
- `buildPartialWeek` (partial.ts) turns the live matchups and odds feed (the same lines the Live page shows) into a `PartialWeek`.
- The Odds page re-runs the simulation with it when this week has started, through the existing worker.

**Definition of done:** tests for the builder and for the simulation (a team far ahead wins its game); `tsc` and build pass; the Odds page shows odds that move with this week's results.

**Out of scope:** frozen snapshots (they stay as published before kickoff), odds history chart, playoff weeks in progress.

## Log
- Built `PartialWeek` + `buildPartialWeek`, wired through `playoffOdds`, the odds worker, `usePartialWeek` and the Odds page. 9 vitest tests (builder and simulation). Checked on the live site: subtitle shows "plus the week 12 games played so far".
- Decision: published/frozen snapshots stay as they were; only today's table re-runs with partial results. Rewinding to an earlier week does not use them.
- Checked old against new on week 12 (probabilities still sum to 6, 1, 1; teams with nothing played land within a point or two of the old roster plan). Found that using lineups as currently set understated teams with empty or weak unplayed slots. Fixed: a player's slot locks at kickoff; every open slot is refilled with the best unplayed rostered player or the waiver-wire level at that position. 15 tests.
