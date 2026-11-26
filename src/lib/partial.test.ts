import { describe, expect, it } from 'vitest'
import { DEFAULT_MODEL, posSd } from './model'
import { simulate, type Ctx, type PartialWeek } from './odds'
import { buildPartialWeek } from './partial'
import type { StarterLine } from './live'
import type { Season } from './stats'

const game = (status: 'scheduled' | 'live' | 'final', period = 0) => ({ eventId: 'e', away: 'GB', home: 'DET', startsAt: '2026-11-26T18:00:00Z', status, period, awayScore: 0, homeScore: 0 })
const line = (playerId: string, actual: number, projected: number, status: 'scheduled' | 'live' | 'final'): StarterLine =>
  ({ playerId, actual, projected, source: 'live', game: game(status, status === 'live' ? 3 : 0) })
const pos = (id: string) => (id.startsWith('q') ? 'QB' : id.startsWith('r') ? 'RB' : 'WR')
const side = (memberId: string, slots: string[], starters: (StarterLine | null)[], bench: StarterLine[] = [], nflOf: (id: string) => string | null = () => 'GB', replacement: Record<string, number> = {}) => ({ memberId, slots, starters, bench, pos, nflOf, replacement })

describe('buildPartialWeek', () => {
  it('banks a finished game and leaves nothing random', () => {
    const w = buildPartialWeek(12, [side('a', ['WR'], [line('w1', 21, 21, 'final')])], DEFAULT_MODEL)
    expect(w.week).toBe(12)
    expect(w.teams.a).toEqual({ fixed: 21, starters: [], open: 0 })
  })

  it('keeps an unplayed player fully random, with his projection as the mean', () => {
    const w = buildPartialWeek(12, [side('a', ['WR'], [line('w1', 0, 14, 'scheduled')])], DEFAULT_MODEL)
    const s = w.teams.a!.starters[0]!
    expect(w.teams.a!.fixed).toBe(0)
    expect(s.m).toBeCloseTo(14, 6)
    expect(s.sd).toBeCloseTo(posSd(DEFAULT_MODEL, 'WR', 14), 6)
  })

  it('banks points so far for a live player and narrows his spread to what is left', () => {
    const w = buildPartialWeek(12, [side('a', ['WR'], [line('w1', 8, 14, 'live')])], DEFAULT_MODEL)
    const s = w.teams.a!.starters[0]!
    expect(w.teams.a!.fixed).toBe(8)
    expect(s.m).toBeCloseTo(6, 6)
    expect(s.sd).toBeLessThan(posSd(DEFAULT_MODEL, 'WR', 14))
    expect(s.sd).toBeGreaterThan(0)
  })

  it('fills an empty starter slot with the best unplayed bench player who fits it', () => {
    const w = buildPartialWeek(12, [side('a', ['QB', 'WR'], [line('q1', 0, 20, 'scheduled'), null], [line('w9', 0, 9, 'scheduled'), line('r9', 0, 15, 'scheduled')])], DEFAULT_MODEL)
    // the RB cannot fill a WR slot, so the 9-point WR does
    expect(w.teams.a!.starters.map((x) => x.m).sort((x, y) => x - y)).toEqual([9, 20])
  })

  it('starts a better unplayed bench player over a weaker unplayed starter', () => {
    const w = buildPartialWeek(12, [side('a', ['WR'], [line('w1', 0, 6, 'scheduled')], [line('w2', 0, 13, 'scheduled')])], DEFAULT_MODEL)
    expect(w.teams.a!.starters.map((x) => x.m)).toEqual([13])
  })

  it('fills an empty slot with the waiver-wire level when nobody on the roster fits', () => {
    const w = buildPartialWeek(12, [side('a', ['WR', 'WR'], [line('w1', 0, 14, 'scheduled'), null], [], () => 'GB', { WR: 8 })], DEFAULT_MODEL)
    const picked = w.teams.a!.starters
    expect(picked.map((x) => x.m).sort((x, y) => x - y)).toEqual([8, 14])
    expect(picked.find((x) => x.m === 8)!.nfl).toBe(-1)
  })

  it('fills every empty slot a position can play, not just one', () => {
    const w = buildPartialWeek(12, [side('a', ['WR', 'WR', 'FLEX'], [null, null, null], [], () => 'GB', { WR: 8 })], DEFAULT_MODEL)
    expect(w.teams.a!.starters.map((x) => x.m)).toEqual([8, 8, 8])
  })

  it('prefers a rostered player over the waiver-wire level when he is better', () => {
    const w = buildPartialWeek(12, [side('a', ['WR'], [line('w1', 0, 14, 'scheduled')], [], () => 'GB', { WR: 8 })], DEFAULT_MODEL)
    expect(w.teams.a!.starters.map((x) => x.m)).toEqual([14])
  })

  it('never swaps out a player whose game has started, even for a better bench player', () => {
    const w = buildPartialWeek(12, [side('a', ['WR'], [line('w1', 2, 4, 'live')], [line('w2', 0, 13, 'scheduled')])], DEFAULT_MODEL)
    expect(w.teams.a!.fixed).toBe(2)
    expect(w.teams.a!.starters.map((x) => x.m)).toEqual([2])
  })

  it('does not bring in a bench player whose game is over', () => {
    const w = buildPartialWeek(12, [side('a', ['WR'], [line('w1', 0, 6, 'scheduled')], [line('w2', 20, 20, 'final')])], DEFAULT_MODEL)
    expect(w.teams.a!.fixed).toBe(0)
    expect(w.teams.a!.starters.map((x) => x.m)).toEqual([6])
  })

  it('gives teammates on one NFL team the same correlation index across teams', () => {
    const w = buildPartialWeek(12, [
      side('a', ['WR'], [line('w1', 0, 10, 'scheduled')], [], () => 'GB'),
      side('b', ['WR', 'WR'], [line('w2', 0, 11, 'scheduled'), line('w3', 0, 12, 'scheduled')], [], (id) => (id === 'w2' ? 'GB' : 'DET')),
    ], DEFAULT_MODEL)
    const nflOfProjection = (team: string, m: number) => w.teams[team]!.starters.find((x) => x.m === m)!.nfl
    expect(nflOfProjection('a', 10)).toBe(nflOfProjection('b', 11)) // both GB
    expect(nflOfProjection('b', 12)).not.toBe(nflOfProjection('b', 11)) // DET
  })

  it('treats a player with no team as independent', () => {
    const w = buildPartialWeek(12, [side('a', ['WR'], [line('w1', 0, 10, 'scheduled')], [], () => null)], DEFAULT_MODEL)
    expect(w.teams.a!.starters[0]!.nfl).toBe(-1)
  })
})

describe('simulate with a week in progress', () => {
  const ctx: Ctx = {
    season: { year: 2026, playoffTeams: 1, playoffStart: 4 } as Season,
    ids: ['a', 'b'], scores: { a: [100], b: [100] },
    pairings: { 1: [['a', 'b']], 2: [['a', 'b']], 3: [['a', 'b']] },
    lastReg: 3, median: false, priorMean: 100, priorSd: 20,
  }
  const odds = (partial?: PartialWeek) => Object.fromEntries(simulate(ctx, 1, 3000, 7, { partial }).teams.map((t) => [t.memberId, t]))

  it('treats two equal teams as even without it', () => {
    expect(odds().a!.playoff).toBeGreaterThan(0.4)
    expect(odds().a!.playoff).toBeLessThan(0.6)
  })

  it('lets the team that is far ahead win the week', () => {
    const r = odds({ week: 2, teams: { a: { fixed: 160, starters: [] }, b: { fixed: 60, starters: [] } } })
    expect(r.a!.playoff).toBeGreaterThan(0.7)
    expect(r.b!.playoff).toBeLessThan(0.3)
    expect(r.a!.rating).toBeCloseTo(160, 0)
  })

  it('still draws the players who have not played', () => {
    const swing = { fixed: 100, starters: [{ m: 30, sd: 40, nfl: -1 }] }
    const r = odds({ week: 2, teams: { a: swing, b: { fixed: 130, starters: [] } } })
    expect(r.a!.playoff).toBeGreaterThan(0.3)
    expect(r.a!.playoff).toBeLessThan(0.7)
  })

  it('ignores a week that is not the next one', () => {
    const r = odds({ week: 3, teams: { a: { fixed: 500, starters: [] }, b: { fixed: 0, starters: [] } } })
    expect(r.a!.rating).toBeLessThan(150)
  })
})
