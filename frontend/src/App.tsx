import { BrowserRouter, Route, Routes } from 'react-router'

function Placeholder() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <p className="text-muted">QuizCircuit: screens coming next.</p>
    </main>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="*" element={<Placeholder />} />
      </Routes>
    </BrowserRouter>
  )
}
