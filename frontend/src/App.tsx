import { BrowserRouter, Route, Routes } from 'react-router'
import { HostCreateFlow } from './pages/HostCreateFlow'
import { HostGame } from './pages/HostGame'
import { LandingPage } from './pages/LandingPage'
import { PlayerGame } from './pages/PlayerGame'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Home: what QuizCircuit is, with Create a quiz and Join a game. */}
        <Route path="/" element={<LandingPage />} />

        {/* Players */}
        <Route path="/join" element={<PlayerGame />} />
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
