# QuizCircuit
 
Real-time, no-account live quiz platform. A host creates a room, players join by code/link with just a name, answer timed questions, and see a leaderboard. Later: AI-generated questions from uploaded documents.
 
Monorepo: `backend/` (FastAPI), `frontend/` (React + TS + Tailwind), `infra/` (AWS, later), `docs/`.
 
## Current phase
 
Phase 1: backend game loop, IN MEMORY ONLY. No database, Redis, auth or AI yet. Do not add them unless asked. Questions are hardcoded or passed in when the room is created.
 
## Stack (backend)
 
Python 3.12, FastAPI, WebSockets (native FastAPI), Pydantic v2, pytest + pytest-asyncio, uv for deps, ruff for lint/format.
 
## Commands (run from backend/)
 
- Install: `uv sync`
- Run: `uv run uvicorn app.main:app --reload`
- Test: `uv run pytest`
- Lint/format: `uv run ruff check . && uv run ruff format .`
## Layout
 
- `app/main.py`: FastAPI app, REST routes
- `app/ws.py`: WebSocket endpoint, message routing
- `app/rooms.py`: Room, Player, game state machine (pure, no I/O)
- `app/live.py`: LiveRoom: a Room's connections, broadcasts, timers and lock
- `app/registry.py`: in-memory room registry (code -> room), code generation
- `app/scoring.py`: pure scoring functions (no I/O)
- `app/models.py`: Pydantic schemas for every WebSocket message
- `tests/`: mirrors app/
## Rules (non-negotiable)
 
- The server owns the clock and all game state. Never trust client timestamps or client-computed scores.
- One answer per player per question. Ignore duplicates with an ALREADY_ANSWERED error.
- Late answers (after the deadline) are rejected with TIME_UP and score 0.
- Scoring lives in `scoring.py` as pure functions and must have unit tests.
- Every WebSocket message must match `docs/protocol.md`. If a new message or field is needed, update the protocol doc in the same change.
- Room state machine: LOBBY -> QUESTION -> REVEAL -> (next QUESTION or FINISHED). No other transitions.
- Joins are rejected once the game has started.
- Never send the correct answer to players before the REVEAL message.
## Working style
 
- Small, focused changes. One task per commit.
- Write or update tests with every change and run them before saying it's done.
- For timer, concurrency or state-machine work: propose the design and edge cases first, wait for approval, then implement.
- Keep functions short and typed. Prefer simple code over clever code.
- Don't add dependencies without saying why.
 