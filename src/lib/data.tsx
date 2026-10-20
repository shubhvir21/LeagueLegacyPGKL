// Loads the league: committed snapshot or a newer browser cache, plus in-browser Resync.
import { useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { fetchAll, type RawData } from './sleeper'
import { buildLeague } from './stats'
import { DataCtx } from './ctx'

const DB = 'pgkl-legacy', STORE = 'kv', KEY = 'raw'

function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open(DB, 1)
      open.onupgradeneeded = () => open.result.createObjectStore(STORE)
      open.onerror = () => resolve(undefined)
      open.onsuccess = () => {
        const req = fn(open.result.transaction(STORE, mode).objectStore(STORE))
        req.onsuccess = () => resolve(req.result as T)
        req.onerror = () => resolve(undefined)
      }
    } catch {
      resolve(undefined)
    }
  })
}


export function DataProvider({ children }: { children: ReactNode }) {
  const [raw, setRaw] = useState<RawData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    ;(async () => {
      const [snap, cached] = await Promise.all([
        fetch('data/league.json').then((r) => (r.ok ? (r.json() as Promise<RawData>) : null)).catch(() => null),
        idb<RawData>('readonly', (s) => s.get(KEY)),
      ])
      // Ignore caches written by an older version of the app (missing newer fields).
      const best = [snap, cached].filter((x): x is RawData => !!x?.players).sort((a, b) => b.syncedAt.localeCompare(a.syncedAt))[0]
      if (best) setRaw(best)
      else setError('No data yet — click Resync to pull from Sleeper.')
    })()
  }, [])

  const resync = useCallback(async () => {
    setSyncing(true)
    setError(null)
    try {
      const fresh = await fetchAll(raw ?? undefined)
      await idb('readwrite', (s) => s.put(fresh, KEY))
      setRaw(fresh)
    } catch (e) {
      setError(`Resync failed: ${(e as Error).message}`)
    } finally {
      setSyncing(false)
    }
  }, [raw])

  const league = useMemo(() => (raw ? buildLeague(raw) : null), [raw])
  return <DataCtx.Provider value={{ league, error, syncing, resync }}>{children}</DataCtx.Provider>
}

export const useData = () => useContext(DataCtx)
/** For pages: the league is guaranteed loaded by the layout. */
export const useLeague = () => useContext(DataCtx).league!
