import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { DataProvider } from './lib/data'
import Layout from './components/Layout'
import History from './pages/History'
import Season, { SeasonIndex, TeamSeason } from './pages/Season'
import Member, { Members } from './pages/Member'
import Versus, { VersusDetail } from './pages/Versus'
import Matchups from './pages/Matchups'
import Playoffs from './pages/Playoffs'
import RecordBook from './pages/RecordBook'
import Management from './pages/Management'
import Transactions from './pages/Transactions'
import Players, { Player } from './pages/Players'
import Achievements from './pages/Achievements'
import Home, { Schedule } from './pages/Home'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DataProvider>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="history" element={<History />} />
            <Route path="schedule" element={<Schedule />} />
            <Route path="management" element={<Management />} />
            <Route path="draft" element={<Navigate to="/management" replace />} />
            <Route path="transactions" element={<Transactions />} />
            <Route path="players" element={<Players />} />
            <Route path="player/:id" element={<Player />} />
            <Route path="achievements" element={<Achievements />} />
            <Route path="seasons" element={<SeasonIndex />} />
            <Route path="season/:year" element={<Season />} />
            <Route path="season/:year/team/:member" element={<TeamSeason />} />
            <Route path="members" element={<Members />} />
            <Route path="member/:id" element={<Member />} />
            <Route path="versus" element={<Versus />} />
            <Route path="versus/:a/:b" element={<VersusDetail />} />
            <Route path="matchups" element={<Matchups />} />
            <Route path="playoffs" element={<Playoffs />} />
            <Route path="records" element={<RecordBook />} />
          </Route>
        </Routes>
      </HashRouter>
    </DataProvider>
  </StrictMode>,
)
