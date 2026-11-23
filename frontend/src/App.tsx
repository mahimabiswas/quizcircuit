import { BrowserRouter, Route, Routes } from 'react-router'
import { HostGame } from './pages/HostGame'
import { HostStartPage } from './pages/HostStartPage'
import { PlayerGame } from './pages/PlayerGame'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Players */}
        <Route path="/" element={<PlayerGame />} />
        {/* Invite links: /join/QC-4821 fills in the code. */}
        <Route path="/join/:code" element={<PlayerGame />} />

        {/* Host */}
        <Route path="/host" element={<HostStartPage />} />
        <Route path="/host/:code" element={<HostGame />} />
      </Routes>
    </BrowserRouter>
  )
}
