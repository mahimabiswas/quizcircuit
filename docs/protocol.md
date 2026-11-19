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

Response:
```json
{"code": "QC-4821", "host_token": "<secret>"}
```

### GET /rooms/{code}
Check a room exists and is joinable. Response: `{"code": "QC-4821", "state": "LOBBY", "player_count": 3}` or 404.

## WebSocket

Connect to `/ws/{code}`. The first message from the client must be `join`.

### Client -> Server

| type | fields | who | notes |
|------|--------|-----|-------|
| `join` | `name`, optional `host_token` | anyone | With a valid `host_token` the client joins as host (host is not a player and cannot answer). Otherwise joins as player. |
| `start` | none | host | Only valid in LOBBY. |
| `answer` | `question_id`, `choice` (0-based index) | player | Only valid in QUESTION, once per question. |
| `kick` | `name` | host | Only valid in LOBBY. |

### Server -> Client

| type | fields | when |
|------|--------|------|
| `joined` | `role` ("host" or "player"), `name` | reply to a successful join |
| `lobby` | `players` (list of names, join order) | on every join/leave/kick, in LOBBY |
| `question` | `id`, `index`, `total`, `text`, `options`, `time_limit`, `ends_at`, `server_time` | start of each question. Never contains the correct answer. |
| `answer_ack` | `question_id` | to the player who answered (not whether it was correct) |
| `answer_count` | `question_id`, `answered`, `total` | to everyone after each answer, so the host sees progress |
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
4. QUESTION ends when the time limit passes or every player has answered, whichever is first.
5. Server sends `reveal`, waits 5 seconds, then sends the next `question` (or `leaderboard` if that was the last).

## Scoring

Formula: `points = round(1000 * (1 - time_used / time_limit / 2))` if correct, else 0.
- `time_used`: seconds from the server sending the question to the server receiving the answer (server-measured).
- `time_limit`: seconds allowed for the question.

Example with time_limit = 20: correct at 4s gives 900; correct at 20s gives 500; wrong gives 0.

## Rules

- Names: trimmed, 1-20 characters, unique in the room (case-insensitive).
- Max 50 players per room (MVP).
- A player who disconnects during a game keeps their score; reconnecting is out of scope for phase 1.
- Answers arriving after `ends_at` are rejected, even by milliseconds.

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
- Host disconnects mid-game: pause or end?
- Per-question time limits instead of one global value.