import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { DataProvider } from './lib/data'
import Layout from './components/Layout'
import History from './pages/History'
import Elo from './pages/Elo'
import Season, { SeasonIndex, TeamSeason } from './pages/Season'
import Member, { Members } from './pages/Member'
import Versus, { VersusDetail } from './pages/Versus'
import Matchups from './pages/Matchups'
import Playoffs from './pages/Playoffs'
import RecordBook from './pages/RecordBook'
import Management from './pages/Management'
import Rules from './pages/Rules'
import Transactions from './pages/Transactions'
import Players, { Player } from './pages/Players'
import Home from './pages/Home'
import Keepers from './pages/Keepers'
import Power from './pages/Power'
import { RecapRedirect } from './pages/Recap'
import AllTime from './pages/AllTime'
import Butterfly from './pages/Butterfly'
import './styles.css'

// Installable app + offline support (production only, so dev hot reload isn't cached).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DataProvider>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="history" element={<History />} />
            <Route path="elo" element={<Elo />} />
            <Route path="schedule" element={<SeasonIndex />} />
            <Route path="management" element={<Management />} />
            <Route path="rules" element={<Rules />} />
            <Route path="draft" element={<Navigate to="/management" replace />} />
            <Route path="transactions" element={<Transactions />} />
            <Route path="players" element={<Players />} />
            <Route path="player/:id" element={<Player />} />
            <Route path="achievements" element={<Navigate to="/" replace />} />
            <Route path="seasons" element={<SeasonIndex />} />
            <Route path="season/:year" element={<Season />} />
            <Route path="season/:year/team/:member" element={<TeamSeason />} />
            <Route path="members" element={<Members />} />
            <Route path="member/:id" element={<Member />} />
            <Route path="versus" element={<Versus />} />
            <Route path="versus/:a/:b" element={<VersusDetail />} />
            <Route path="matchups" element={<Matchups />} />
            <Route path="matchups/history" element={<Navigate to="/versus" replace />} />
            <Route path="playoffs" element={<Playoffs />} />
            <Route path="keepers" element={<Keepers />} />
            <Route path="odds" element={<Navigate to="/playoffs" replace />} />
            <Route path="trades" element={<Navigate to="/butterfly" replace />} />
            <Route path="power" element={<Power />} />
            <Route path="recap" element={<RecapRedirect />} />
            <Route path="recap/:year" element={<RecapRedirect />} />
            <Route path="dynasty" element={<Navigate to="/members" replace />} />
            <Route path="rivalries" element={<Navigate to="/versus" replace />} />
            <Route path="alltime" element={<AllTime />} />
            <Route path="butterfly" element={<Butterfly />} />
            <Route path="whatif" element={<Navigate to="/butterfly" replace />} />
            <Route path="records" element={<RecordBook />} />
          </Route>
        </Routes>
      </HashRouter>
    </DataProvider>
  </StrictMode>,
)
