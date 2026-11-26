"""POST /quizzes/generate. The OpenAI call is faked: no network, no API key."""

import json
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import main, quizgen
from app.main import create_app

PDF_BYTES = b"%PDF-1.7 pretend pdf"
QUESTION = {
    "kind": "multiple_choice",
    "text": "Who handles writes?",
    "options": ["The leader", "A follower", "The client", "Nobody"],
    "correct": 0,
    "source": {"file": "notes.pdf", "page": 2, "quote": "Writes go to the leader."},
}


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app())


@pytest.fixture
def model(monkeypatch: pytest.MonkeyPatch) -> SimpleNamespace:
    """Replace the OpenAI call; record what it was sent."""
    fake = SimpleNamespace(output=json.dumps({"questions": [QUESTION]}), inputs=[], error=None)

    async def fake_call(parts: list[dict[str, str]]) -> str:
        fake.inputs.append(parts)
        if fake.error:
            raise fake.error
        return fake.output

    monkeypatch.setattr(quizgen, "_call_model", fake_call)
    return fake


def pdf(name: str = "notes.pdf", data: bytes = PDF_BYTES) -> tuple[str, tuple[str, bytes, str]]:
    return ("files", (name, data, "application/pdf"))


def text(name: str, data: bytes = b"Some notes.") -> tuple[str, tuple[str, bytes, str]]:
    return ("files", (name, data, "text/plain"))


def post(client: TestClient, files: list[Any], **form: Any):
    return client.post("/quizzes/generate", files=files, data={k: str(v) for k, v in form.items()})


# --- success ----------------------------------------------------------------------


def test_returns_checked_questions_with_sources(client, model) -> None:
    response = post(client, [pdf()], count=5)
    assert response.status_code == 200
    assert response.json() == {
        "questions": [
            {
                "text": "Who handles writes?",
                "options": ["The leader", "A follower", "The client", "Nobody"],
                "correct": 0,
                "source": {"file": "notes.pdf", "page": 2, "quote": "Writes go to the leader."},
            }
        ]
    }


def test_sends_every_file_and_the_requested_mix(client, model) -> None:
    post(client, [pdf(), text("summary.md")], count=8, true_false=3)
    parts = model.inputs[0]
    assert parts[0]["text"] == 'Document: "notes.pdf"'
    assert parts[1]["type"] == "input_file"
    assert parts[2]["text"] == 'Document: "summary.md"'
    assert parts[3]["text"] == "Some notes."
    assert "5 multiple choice and 3 true/false" in parts[-1]["text"]


def test_count_defaults_to_10_and_the_mix_to_automatic(client, model) -> None:
    post(client, [pdf()])
    instructions = model.inputs[0][-1]["text"]
    assert "exactly 10 questions" in instructions
    assert "mostly multiple choice" in instructions


def test_cleans_file_names_and_renames_duplicates(client, model) -> None:
    post(client, [pdf("C:\\Users\\me\\notes.pdf"), pdf("notes.pdf"), pdf("NOTES.pdf")])
    labels = [p["text"] for p in model.inputs[0] if p.get("text", "").startswith("Document:")]
    assert labels == [
        'Document: "notes.pdf"',
        'Document: "notes (2).pdf"',
        'Document: "NOTES (3).pdf"',
    ]


# --- bad uploads (rejected before calling the model) -------------------------------


def test_needs_at_least_one_file(client, model) -> None:
    response = client.post("/quizzes/generate", data={"count": "5"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Upload at least one file."


def test_allows_at_most_three_files(client, model) -> None:
    response = post(client, [pdf(f"n{i}.pdf") for i in range(4)])
    assert response.status_code == 400
    assert "at most 3" in response.json()["detail"]


def test_rejects_other_file_types(client, model) -> None:
    response = post(client, [("files", ("slides.pptx", b"PK...", "application/octet-stream"))])
    assert response.status_code == 415
    assert "Export slides as PDF" in response.json()["detail"]


def test_rejects_a_fake_pdf(client, model) -> None:
    response = post(client, [pdf("notes.pdf", b"not really a pdf")])
    assert response.status_code == 415


def test_rejects_an_empty_file(client, model) -> None:
    assert post(client, [text("empty.txt", b"  \n ")]).status_code == 400


def test_rejects_files_over_the_size_limit(client, model, monkeypatch) -> None:
    monkeypatch.setattr(main, "MAX_FILE_BYTES", 20)
    response = post(client, [pdf("big.pdf", b"%PDF-" + b"x" * 30)])
    assert response.status_code == 413
    assert "larger than 10 MB" in response.json()["detail"]


@pytest.mark.parametrize("form", [{"count": 4}, {"count": 21}, {"count": 5, "true_false": 6}])
def test_rejects_bad_counts(client, model, form: dict[str, int]) -> None:
    assert post(client, [pdf()], **form).status_code == 422


def test_bad_uploads_never_reach_the_model(client, model) -> None:
    post(client, [pdf("notes.pdf", b"not a pdf")])
    post(client, [pdf()], count=99)
    assert model.inputs == []


# --- generation failures -------------------------------------------------------------


@pytest.mark.parametrize("status", [429, 502, 503])
def test_generation_errors_keep_their_status_and_message(client, model, status: int) -> None:
    model.error = quizgen.QuizGenError("Something the host can read.", status)
    response = post(client, [pdf()])
    assert response.status_code == status
    assert response.json()["detail"] == "Something the host can read."


def test_model_output_with_no_usable_questions_is_a_502(client, model) -> None:
    model.output = json.dumps({"questions": [{**QUESTION, "correct": 9}]})
    response = post(client, [pdf()])
    assert response.status_code == 502
    assert "No usable questions" in response.json()["detail"]


# --- rate limit: 3 generations per IP per 24 hours ---------------------------------


def test_the_fourth_generation_from_one_ip_is_refused(client, model) -> None:
    assert [post(client, [pdf()]).status_code for _ in range(3)] == [200, 200, 200]
    response = post(client, [pdf()])
    assert response.status_code == 429
    assert response.json()["detail"] == (
        "You've used your 3 quiz generations for today. Try again in 24 hours."
    )
    assert int(response.headers["Retry-After"]) > 23 * 60 * 60
    assert len(model.inputs) == 3  # the refused one never reached the model


def test_another_ip_still_has_its_turns(client, model) -> None:
    for _ in range(3):
        post(client, [pdf()])
    other = TestClient(client.app, client=("203.0.113.9", 50000))
    assert post(other, [pdf()]).status_code == 200


def test_bad_uploads_and_failed_generations_dont_use_a_turn(client, model) -> None:
    for _ in range(3):
        post(client, [pdf("notes.pdf", b"not a pdf")])  # 415, rejected before the limit
    model.error = quizgen.QuizGenError("The AI is busy right now.", 502)
    for _ in range(3):
        post(client, [pdf()])  # 502: the turn is given back
    model.error = None
    assert [post(client, [pdf()]).status_code for _ in range(3)] == [200, 200, 200]


@pytest.mark.parametrize(
    ("seconds", "text"),
    [(5, "1 minute"), (61, "2 minutes"), (3599, "1 hour"), (3600, "1 hour"), (3601, "2 hours")],
)
def test_wait_is_rounded_up_into_words(seconds: float, text: str) -> None:
    assert main._how_long(seconds) == text


def test_without_an_api_key_it_explains(client, monkeypatch) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    response = post(client, [pdf()])
    assert response.status_code == 503
    assert "OPENAI_API_KEY" in response.json()["detail"]
