# QuizCircuit frontend

React + TypeScript + Tailwind, built with Vite.

```bash
npm install
npm run dev      # http://localhost:5173, proxies /rooms and /ws to the backend on :8000
npm test         # unit and component tests (Vitest)
npm run build    # type-check and production build
npm run lint     # oxlint
```

Start the backend first (`uv run uvicorn app.main:app --reload` in `../backend`).
