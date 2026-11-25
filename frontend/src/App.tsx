import { BrowserRouter, Route, Routes } from 'react-router'
import { HostCreateFlow } from './pages/HostCreateFlow'
import { HostGame } from './pages/HostGame'
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
        {/* Upload documents, let the AI write questions, review them, create the game. */}
        <Route path="/host" element={<HostCreateFlow />} />
        <Route path="/host/:code" element={<HostGame />} />
      </Routes>
    </BrowserRouter>
  )
}
