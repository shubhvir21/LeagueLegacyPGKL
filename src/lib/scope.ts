// Which games belong to the week being shown.
//
// The shared feed keeps the last few days of finished games as well as this week's and later ones, so a
// starter who played last week is matched to that finished game and projects nothing. The week is
// identified by the dates its games are played on, which Sleeper's weekly projections carry.
import type { LiveFeed } from './live'

const ET = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' })

/** The Eastern-time calendar date of an instant, as YYYY-MM-DD. */
export function etDate(instant: string): string {
  return ET.format(new Date(instant))
}

/**
 * The feed's games played on the given dates. Without any dates to go by the feed is left whole:
 * dropping every game would hide the league rather than fix it.
 */
export function selectWeekGames(feed: LiveFeed | null, dates: Set<string>): LiveFeed | null {
  if (!feed || dates.size === 0) return feed
  const games = Object.fromEntries(Object.entries(feed.games).filter(([, game]) => dates.has(etDate(game.game.startsAt))))
  return { ...feed, games }
}
