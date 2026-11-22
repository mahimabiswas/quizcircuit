import { BrowserRouter, Route, Routes } from 'react-router'
import { PlayerGame } from './pages/PlayerGame'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PlayerGame />} />
        {/* Invite links: /join/QC-4821 fills in the code. */}
        <Route path="/join/:code" element={<PlayerGame />} />
      </Routes>
    </BrowserRouter>
  )
}
