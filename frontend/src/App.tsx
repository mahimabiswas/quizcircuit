import { BrowserRouter, Route, Routes } from 'react-router'
import { CreateQuizPage } from './pages/CreateQuizPage'
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
        {/* TEMPORARY: the next step connects this to the AI and makes it the host start page. */}
        <Route
          path="/host/create"
          element={<CreateQuizPage onGenerate={(request) => console.info('generate', request)} />}
        />
        <Route path="/host/:code" element={<HostGame />} />
      </Routes>
    </BrowserRouter>
  )
}
