# QuizCircuit

**Live: [quizcircuit.vercel.app](https://quizcircuit.vercel.app)**

QuizCircuit is a live quiz game you can run from your own notes. Upload a PDF or a text file, let the AI write the questions, fix anything it got wrong, and share a code. Players join from their phone or laptop with just a name. No accounts, no app to install.


> The backend runs on Render's free tier, so if nobody has used it for a while the first request can take about a minute while the server wakes up.

## How a game works

1. **Create.** The host uploads up to 3 files (PDF, TXT or MD, 10 MB each), picks how many questions (5–20) and, if they want, the mix of multiple choice and true/false.
2. **Review.** The AI's questions come back with the file, page and quote each one is based on. The host can edit, delete or add questions and set the timer before anything goes live.
3. **Invite.** The host gets a join code (like `QC-4821`) and a link. Players appear in the lobby as they join, and the host can remove anyone.
4. **Play.** Everyone sees the same question with a countdown. Faster correct answers score more. After each question the host sees how the room answered, then moves on when they're ready.
5. **Results.** A final leaderboard with ties sharing a rank.

## Stack

- **Backend:** Python 3.12, FastAPI, native WebSockets, Pydantic v2, pytest. Dependencies managed with uv.
- **Frontend:** React 19, TypeScript, Tailwind CSS v4, Vite, Vitest + Testing Library.
- **AI:** OpenAI (`gpt-6-luna`) through the Responses API with a strict JSON schema.
- **Hosting:** frontend on Vercel, backend on Render.

## Design decisions

Key choices and why I made them.

**The server owns the clock and the scores.** Every question has a server-set deadline, and the client only uses it to draw the countdown (corrected for clock differences). Late answers get zero and each player gets one answer per question. A correct answer is worth `1000 × (1 − time taken / time limit / 2)`, so between 1000 and 500 points, which rewards speed without letting it dominate. The correct answer isn't sent to players until the reveal, so they can't read it from dev tools early.

**A strict state machine.** A room is always in one of four states: `LOBBY → QUESTION → REVEAL → (next QUESTION or FINISHED)`. The game logic is plain Python with no I/O, so it's easy to test. A separate layer handles connections, broadcasts and the timer, and a per-room lock stops a last-second answer and the timer from changing the game at the same moment.

**The host decides when to move on.** The reveal screen first advanced automatically, but in a real room people want to talk about the answer, so now the host presses Next. If the host refreshes or loses connection, they can rejoin with a token kept in the browser tab and get the current game state back.

**No accounts, and everything in memory.** There's no database, which kept the first version simple and means no player data is saved to disk. The trade-off is that a server restart ends any live games, and it has to run as a single instance. I'd add Redis if it ever needed to scale.

**Validating what the AI returns.** The model is asked for a fixed JSON shape, but the server still checks every question: the right number of options, a valid correct answer, sensible true/false wording, and a source that points at an uploaded file. Anything that fails is dropped, the UI says so, and the host reviews the rest before a game.

**Why OpenAI.** I wanted this to be free to run, so I started with Google's Gemini free tier. It kept returning "model overloaded" errors, which isn't great when a room full of people is waiting. I switched to a small OpenAI model, which costs a fraction of a cent per quiz and has been reliable. All the provider-specific code sits in two functions in `quizgen.py`, so switching again would be a small change.

**Rate limiting AI generation.** Every generation costs money, so each IP address gets 3 per rolling 24 hours. Rejected uploads and failed generations don't count, so a host never loses a turn because of an error. Going over the limit shows a clear message with how long to wait. Creating rooms and joining games aren't limited, since a whole classroom can share one IP.

**Vercel + Render.** Vercel serves the frontend from a CDN and never sleeps. Render runs the backend as one long-running process, which the in-memory game state and long-lived WebSockets need. Vercel can't proxy WebSockets, so the frontend talks to the backend directly using a build-time `VITE_API_URL`, and the backend only allows requests from the frontend's origin (CORS). In local development none of this is needed: Vite's proxy makes it all one origin.


## What's not there yet

- Players can't rejoin after refreshing mid-game (the host can).
- Quizzes and results aren't saved, and there's no "regenerate" for a single question.
- Rooms abandoned halfway through stay in memory until the server restarts.
- The rate-limit counts also reset when the server restarts or Render puts it to sleep.

## Running it locally

You'll need Python 3.12 with [uv](https://docs.astral.sh/uv/), Node 24, and an OpenAI API key.

```bash
# Backend
cd backend
uv sync
cp .env.example .env          # then add your OPENAI_API_KEY
uv run python -m uvicorn app.main:app --reload --env-file .env

# Frontend (in another terminal)
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. To try it with your phone on the same Wi-Fi, run `npm run dev -- --host` and open the Network URL it prints.

## Tests

```bash
cd backend && uv run python -m pytest      # 268 tests
cd frontend && npm test                    # 204 tests
```

The backend tests cover scoring, every state-machine transition and error, the WebSocket protocol, timers, the upload checks and the rate limit, with the OpenAI call faked. The frontend tests use a fake WebSocket so every screen can be tested without a server.

## Project layout

```
backend/   FastAPI app: rooms, game loop, WebSockets, AI generation
frontend/  React app: landing page, host flow, player screens
docs/      protocol.md, the REST and WebSocket contract between the two
```
