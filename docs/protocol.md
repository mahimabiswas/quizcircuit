# QuizCircuit protocol

Contract between frontend and backend. All real-time traffic is JSON over one WebSocket per client. Every message has a `type` field.

## REST

### POST /rooms
Create a room. (Phase 1: questions are sent in the body. Later they come from a saved quiz.)

Request:
```json
{
  "time_limit": 20,
  "questions": [
    {"text": "What is 2+2?", "options": ["3", "4", "5", "6"], "correct": 1}
  ]
}
```

Response (201):
```json
{"code": "QC-4821", "host_token": "<secret>"}
```
Invalid input returns 422: no questions, empty text or options, fewer than 2 options, `correct` out of range or not an integer, or `time_limit` not positive.

### GET /rooms/{code}
Check a room exists and is joinable. Response: `{"code": "QC-4821", "state": "LOBBY", "player_count": 3}` or 404.

Room codes are case-insensitive everywhere (`qc-4821` works). A room is deleted once it is FINISHED and its last connection closes.

### POST /quizzes/generate
Generate quiz questions from documents with AI. Nothing is stored; the host reviews and edits the result, then creates a room with `POST /rooms`.

Request: `multipart/form-data`

| field | type | notes |
|-------|------|-------|
| `files` | 1-3 files | `.pdf`, `.txt` or `.md`, max 10 MB each. Slides must be exported as PDF. |
| `count` | int, 5-20 | number of questions. Default 10. |
| `true_false` | int, optional | how many should be true/false (0 to `count`). Omit to let the AI choose (mostly multiple choice). |

Response (200):
```json
{"questions": [
  {
    "text": "Who handles writes in leader-based replication?",
    "options": ["The leader", "Any follower", "The client", "Nobody"],
    "correct": 0,
    "source": {"file": "notes.pdf", "page": 4, "quote": "All writes go to the leader."}
  }
]}
```
- Every question has 2-4 options; true/false questions have exactly `["True", "False"]`.
- `source` may be `null`. `page` is set only for PDFs. `file` is the uploaded file's name (duplicates are renamed `notes (2).pdf`).
- May return fewer questions than `count`: questions that fail the server's checks are dropped.
- The AI can still be wrong: the host must review the questions before a game.

Errors return `{"detail": "<message for the host>"}`:

| status | when |
|--------|------|
| 400 | no files, more than 3, or an empty file |
| 413 | a file over 10 MB |
| 415 | not a PDF/TXT/MD file, or a `.pdf` that isn't a real PDF |
| 422 | `count` outside 5-20, or `true_false` more than `count` |
| 429 | the AI's free usage limit was reached; retry in a minute |
| 502 | the AI failed or returned nothing usable; retry |
| 503 | AI generation isn't set up on the server (no or rejected API key) |

## WebSocket

Connect to `/ws/{code}`. The first message from the client must be `join`.

- Unknown room: the server sends `error` `ROOM_NOT_FOUND`, then closes with code 4404.
- Before a successful `join`, any other message gets `error` `BAD_MESSAGE`. A failed join (for example `NAME_TAKEN`) keeps the socket open, so the client can try again.
- A socket that has not joined within 30 seconds is closed with code 4408.

### Close codes

| code | meaning |
|------|---------|
| 4000 | kicked by the host (sent after `kicked`) |
| 4001 | host connection replaced by a newer one with the same `host_token` |
| 4404 | room not found |
| 4408 | no successful `join` within 30 seconds |

### Client -> Server

| type | fields | who | notes |
|------|--------|-----|-------|
| `join` | `name`, optional `host_token` | anyone | Without `host_token`, joins as a player. With a valid `host_token`, joins as host (host is not a player and cannot answer). A wrong `host_token` gets `NOT_HOST`; the client is not joined. A second `join` on the same socket gets `WRONG_STATE`. |
| `start` | none | host | Only valid in LOBBY with at least one player (otherwise `WRONG_STATE`). |
| `answer` | `question_id`, `choice` (0-based index) | player | Only valid in QUESTION, once per question. From the host: `WRONG_STATE`. |
| `kick` | `name` | host | Only valid in LOBBY. Kicking a name that is not in the room does nothing. |
| `next` | none | host | Only valid in REVEAL (otherwise `WRONG_STATE`). Sends the next `question`, or the `leaderboard` after the last question. A second tap arrives after the next question has opened and gets `WRONG_STATE`, so it never skips a question. |

Unknown extra fields in client messages are ignored.

### Host reconnects

The host can join again with the same `host_token` at any time, including mid-game. A new host connection replaces the old one, which is closed with 4001. After `joined`, the host gets the current state:

| state | host receives |
|-------|---------------|
| LOBBY | `lobby` |
| QUESTION | `question`, then `answer_count` |
| REVEAL | the last `reveal` |
| FINISHED | `leaderboard` |

If the host disconnects, an open question still ends on its timer, but the game then waits on the `reveal` until the host rejoins and sends `next`.

### Server -> Client

| type | fields | when |
|------|--------|------|
| `joined` | `role` ("host" or "player"), `name` | reply to a successful join |
| `lobby` | `players` (list of names, join order) | on every join/leave/kick, in LOBBY |
| `question` | `id`, `index`, `total`, `text`, `options`, `time_limit`, `ends_at`, `server_time` | start of each question. Never contains the correct answer. In phase 1, `id` equals `index`. |
| `answer_ack` | `question_id` | to the player who answered (not whether it was correct) |
| `answer_count` | `question_id`, `answered`, `total` | to everyone after each answer, and when a player disconnects mid-question, so the host sees progress. Counts connected players only. |
| `reveal` | `question_id`, `correct`, `distribution`, `results` | when the timer ends or everyone has answered |
| `leaderboard` | `rankings` | after the last reveal. State becomes FINISHED. |
| `kicked` | none | sent to a removed player before closing |
| `error` | `code`, `message` | any rejected action |

Times (`ends_at`, `server_time`) are Unix seconds (float), server clock. Clients use them only to draw the countdown (`ends_at - server_time` gives time left, which avoids client clock skew). They never decide anything.

### Payload shapes

`reveal`:
```json
{
  "type": "reveal",
  "question_id": 3,
  "correct": 1,
  "distribution": [2, 9, 1, 0],
  "results": [
    {"name": "Mahima", "correct": true, "points": 900, "total": 2700},
    {"name": "Omar", "correct": false, "points": 0, "total": 1800}
  ]
}
```
`distribution[i]` is the number of players who picked option i. `results` has one entry per player, including players who did not answer (`correct: false`, `points: 0`).

`leaderboard`:
```json
{"type": "leaderboard", "rankings": [
  {"rank": 1, "name": "Mahima", "score": 7400},
  {"rank": 2, "name": "Omar", "score": 6900}
]}
```
Ties share a rank (1, 1, 3).

## Game flow

States: `LOBBY -> QUESTION -> REVEAL -> QUESTION ... -> FINISHED`

1. Host and players `join`. Everyone gets `lobby` updates.
2. Host sends `start`. Joins are now rejected (GAME_STARTED).
3. Server sends `question` and starts the timer.
4. QUESTION ends when the time limit passes or every connected player has answered, whichever is first.
5. Server sends `reveal`. The game stays on the reveal until the host sends `next`, then the server sends the next `question` (or `leaderboard` if that was the last).

## Scoring

Formula: `points = round(1000 * (1 - time_used / time_limit / 2))` if correct, else 0.
- `time_used`: seconds from the server sending the question to the server receiving the answer (server-measured).
- `time_limit`: seconds allowed for the question.

Example with time_limit = 20: correct at 4s gives 900; correct at 20s gives 500; wrong gives 0.

## Rules

- Names: trimmed, 1-20 characters, unique in the room (case-insensitive).
- Max 50 players per room (MVP).
- A player who leaves the lobby is removed, and their name is free again.
- A player who disconnects during a game keeps their score and still appears in `reveal` results and the leaderboard; reconnecting is out of scope for phase 1.
- Answers arriving after `ends_at` are rejected with `TIME_UP`, even by milliseconds. So are answers for a question that has already been revealed.

## Error codes

| code | meaning |
|------|---------|
| `ROOM_NOT_FOUND` | no room with that code |
| `NAME_TAKEN` | name already used in this room |
| `NAME_INVALID` | empty, too long, or bad characters |
| `ROOM_FULL` | player cap reached |
| `GAME_STARTED` | join attempted after start |
| `NOT_HOST` | host-only action from a non-host |
| `WRONG_STATE` | action not valid in the current state |
| `ALREADY_ANSWERED` | second answer for the same question |
| `TIME_UP` | answer received after the deadline |
| `BAD_MESSAGE` | malformed JSON, unknown type, or missing/invalid fields |

## Open questions (decide later)

- Reconnect: player token so a refresh restores the session.
- Per-question time limits instead of one global value.
- Cleaning up rooms abandoned in the lobby or mid-game (a game everyone has left waits on its reveal forever).