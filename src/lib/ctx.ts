import { createContext } from 'react'
import type { League } from './stats'

export interface Ctx {
  league: League | null
  error: string | null
  syncing: boolean
  resync: () => Promise<void>
}
// Kept in its own module so hot reloads of data.tsx don't create a second context.
export const DataCtx = createContext<Ctx>(null!)
