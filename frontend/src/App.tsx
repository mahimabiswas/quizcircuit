import { BrowserRouter, Route, Routes } from 'react-router'
import { JoinPage } from './pages/JoinPage'

// Temporary: the next step connects this to the game server.
function handleJoin(code: string, name: string) {
  console.info('join', { code, name })
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<JoinPage onJoin={handleJoin} />} />
        <Route path="/join/:code" element={<JoinPage onJoin={handleJoin} />} />
      </Routes>
    </BrowserRouter>
  )
}
