# QuizCircuit
 
Real-time, no-account live quiz platform. A host creates a room, players join by code/link with just a name, answer timed questions, and see a leaderboard. Later: AI-generated questions from uploaded documents.
 
Monorepo: `backend/` (FastAPI), `frontend/` (React + TS + Tailwind), `infra/` (AWS, later), `docs/`.
 
## Current phase
 
Phase 1 is done: the game loop runs IN MEMORY ONLY. No database, Redis or auth yet. Do not add them unless asked.

Phase 2 (in progress): AI quiz generation from uploaded documents, in `app/quizgen.py`. Model: OpenAI `gpt-6-luna` via the Responses API (PDFs are sent as files; strict JSON schema). Another OpenAI model is just the `QUIZ_MODEL` setting. Only `build_input` and `_call_model` in `quizgen.py` know OpenAI's formats, so another provider means rewriting those two. Keep it one file until there's a concrete reason to split it.
 
## Stack (backend)
 
Python 3.12, FastAPI, WebSockets (native FastAPI), Pydantic v2, pytest + pytest-asyncio, uv for deps, ruff for lint/format.
 
## Commands (run from backend/)
 
- Install: `uv sync`
- Run: `uv run python -m uvicorn app.main:app --reload --env-file .env` (`.env` holds `OPENAI_API_KEY`; copy `.env.example`)
- Test: `uv run python -m pytest`
- Lint/format: `uv run python -m ruff check . && uv run python -m ruff format .`
- On this Windows machine an Application Control policy blocks executables inside `.venv\Scripts`, now including `python.exe` itself, so `uv run ...` fails there. Use uv's base interpreter with the venv's packages added instead, e.g. tests:
  `& "$env:APPDATA\uv\python\cpython-3.12-windows-x86_64-none\python.exe" -c "import site, sys; site.addsitedir(r'.venv\Lib\site-packages'); import pytest; sys.exit(pytest.main(['-q']))"`
## Layout
 
- `app/main.py`: FastAPI app, REST routes
- `app/ws.py`: WebSocket endpoint, message routing
- `app/rooms.py`: Room, Player, game state machine (pure, no I/O)
- `app/live.py`: LiveRoom: a Room's connections, broadcasts, timers and lock
- `app/registry.py`: in-memory room registry (code -> room), code generation
- `app/scoring.py`: pure scoring functions (no I/O)
- `app/models.py`: Pydantic schemas for every WebSocket message
- `app/quizgen.py`: AI quiz generation: settings (`QUIZ_MODEL`, `OPENAI_API_KEY`), shapes, prompt, the OpenAI call, and the checks on model output
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
- Never trust model output: every generated question goes through `check_questions` in `quizgen.py`, and the host reviews it before a game.
- API keys only in environment variables or a git-ignored `.env`; never in code, logs or the frontend.
## Frontend
 
- Commands (run from frontend/): `npm run dev`, `npm test`, `npm run build`, `npm run lint`.
- Colours and fonts come from the `@theme` tokens in `src/index.css`. Never use raw hex values in components.
- Every screen must work on both a phone and a laptop. Build phone-first, then adapt from the `sm` breakpoint (640px) up.
- Build one screen per step, with tests, and stop for review before the next.
 
## Working style
 
- Small, focused changes. One task per commit.
- Write or update tests with every change and run them before saying it's done.
- For timer, concurrency or state-machine work: propose the design and edge cases first, wait for approval, then implement.
- Keep functions short and typed. Prefer simple code over clever code.
- Don't add dependencies without saying why.
 