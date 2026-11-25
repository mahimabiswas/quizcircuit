import { BrowserRouter, Route, Routes } from 'react-router'
import { HostGame } from './pages/HostGame'
import { PlayerGame } from './pages/PlayerGame'
import { ReviewQuizPage } from './pages/ReviewQuizPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Players */}
        <Route path="/" element={<PlayerGame />} />
        {/* Invite links: /join/QC-4821 fills in the code. */}
        <Route path="/join/:code" element={<PlayerGame />} />

        {/* Host */}
        {/* Review and edit the quiz, then create the game. */}
        <Route path="/host" element={<ReviewQuizPage />} />
        <Route path="/host/:code" element={<HostGame />} />
      </Routes>
    </BrowserRouter>
  )
}
