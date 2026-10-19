import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { DataProvider } from './lib/data'
import Layout from './components/Layout'
import History from './pages/History'
import Season, { SeasonIndex, TeamSeason } from './pages/Season'
import Member, { Members } from './pages/Member'
import Versus, { VersusDetail } from './pages/Versus'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DataProvider>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<History />} />
            <Route path="seasons" element={<SeasonIndex />} />
            <Route path="season/:year" element={<Season />} />
            <Route path="season/:year/team/:member" element={<TeamSeason />} />
            <Route path="members" element={<Members />} />
            <Route path="member/:id" element={<Member />} />
            <Route path="versus" element={<Versus />} />
            <Route path="versus/:a/:b" element={<VersusDetail />} />
          </Route>
        </Routes>
      </HashRouter>
    </DataProvider>
  </StrictMode>,
)
