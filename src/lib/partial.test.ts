import { describe, expect, it } from 'vitest'
import { DEFAULT_MODEL, posSd } from './model'
import { simulate, type Ctx, type PartialWeek } from './odds'
import { buildPartialWeek } from './partial'
import type { StarterLine } from './live'
import type { Season } from './stats'

const game = (status: 'scheduled' | 'live' | 'final', period = 0) => ({ eventId: 'e', away: 'GB', home: 'DET', startsAt: '2026-11-26T18:00:00Z', status, period, awayScore: 0, homeScore: 0 })
const line = (playerId: string, actual: number, projected: number, status: 'scheduled' | 'live' | 'final'): StarterLine =>
  ({ playerId, actual, projected, source: 'live', game: game(status, status === 'live' ? 3 : 0) })
const pos = () => 'WR'

describe('buildPartialWeek', () => {
  it('banks a finished game and leaves nothing random', () => {
    const w = buildPartialWeek(12, [{ memberId: 'a', lines: [line('p1', 21, 21, 'final')], pos, nflOf: () => 'GB' }], DEFAULT_MODEL)
    expect(w.week).toBe(12)
    expect(w.teams.a).toEqual({ fixed: 21, starters: [], open: 0 })
  })

  it('keeps an unplayed player fully random, with his projection as the mean', () => {
    const w = buildPartialWeek(12, [{ memberId: 'a', lines: [line('p1', 0, 14, 'scheduled')], pos, nflOf: () => 'GB' }], DEFAULT_MODEL)
    const s = w.teams.a!.starters[0]!
    expect(w.teams.a!.fixed).toBe(0)
    expect(s.m).toBeCloseTo(14, 6)
    expect(s.sd).toBeCloseTo(posSd(DEFAULT_MODEL, 'WR', 14), 6)
  })

  it('banks points so far for a live player and narrows his spread to what is left', () => {
    const w = buildPartialWeek(12, [{ memberId: 'a', lines: [line('p1', 8, 14, 'live')], pos, nflOf: () => 'GB' }], DEFAULT_MODEL)
    const s = w.teams.a!.starters[0]!
    expect(w.teams.a!.fixed).toBe(8)
    expect(s.m).toBeCloseTo(6, 6)
    expect(s.sd).toBeLessThan(posSd(DEFAULT_MODEL, 'WR', 14))
    expect(s.sd).toBeGreaterThan(0)
  })

  it('gives teammates on one NFL team the same correlation index across teams', () => {
    const w = buildPartialWeek(12, [
      { memberId: 'a', lines: [line('p1', 0, 10, 'scheduled')], pos, nflOf: () => 'GB' },
      { memberId: 'b', lines: [line('p2', 0, 10, 'scheduled'), line('p3', 0, 10, 'scheduled')], pos, nflOf: (id) => (id === 'p2' ? 'GB' : 'DET') },
    ], DEFAULT_MODEL)
    const [a, b2, b3] = [w.teams.a!.starters[0]!, w.teams.b!.starters[0]!, w.teams.b!.starters[1]!]
    expect(a.nfl).toBe(b2.nfl)
    expect(b3.nfl).not.toBe(a.nfl)
  })

  it('treats a player with no team as independent', () => {
    const w = buildPartialWeek(12, [{ memberId: 'a', lines: [line('p1', 0, 10, 'scheduled')], pos, nflOf: () => null }], DEFAULT_MODEL)
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
