"""Quiz generation. Google is never called: tests fake `_call_model` or Google's client."""

import base64
import json
from types import SimpleNamespace
from typing import Any

import pytest

from app import quizgen
from app.quizgen import (
    DEFAULT_MODEL,
    MAX_QUOTE_LENGTH,
    PDF,
    Document,
    QuizGenError,
    build_input,
    generate_quiz,
)

NOTES = Document("notes.pdf", PDF, b"%PDF-1.7 fake")
README = Document("readme.md", "text/markdown", b"# Raft\nLeaders take writes.")


def question(**changes: Any) -> dict[str, Any]:
    """A good multiple-choice question as the model would return it, with changes."""
    base = {
        "kind": "multiple_choice",
        "text": "Who handles writes in leader-based replication?",
        "options": ["The leader", "Any follower", "The client", "Nobody"],
        "correct": 0,
        "source": {"file": "notes.pdf", "page": 4, "quote": "All writes go to the leader."},
    }
    return {**base, **changes}


def true_false(options: list[str], correct: int) -> dict[str, Any]:
    return question(kind="true_false", text="Leaders handle every write.", options=options,
                    correct=correct)  # fmt: skip


@pytest.fixture
def model(monkeypatch: pytest.MonkeyPatch):
    """Replace the Gemini call. Set `model.output` to the JSON the 'model' returns."""
    fake = SimpleNamespace(output="", inputs=[])

    async def fake_call(parts: list[dict[str, str]]) -> str:
        fake.inputs.append(parts)
        return fake.output

    monkeypatch.setattr(quizgen, "_call_model", fake_call)
    return fake


def returns(model: SimpleNamespace, *questions: dict[str, Any]) -> None:
    model.output = json.dumps({"questions": list(questions)})


async def generate(*questions: dict[str, Any], model, documents=(NOTES,), count=10):
    returns(model, *questions)
    return await generate_quiz(list(documents), count)


# --- inputs -------------------------------------------------------------------------


async def test_rejects_bad_requests_before_calling_the_model(model) -> None:
    for kwargs in ({"count": 4}, {"count": 21}, {"count": 10, "true_false": 11}):
        with pytest.raises(ValueError):
            await generate_quiz([NOTES], **kwargs)
    with pytest.raises(ValueError):
        await generate_quiz([], 10)
    assert model.inputs == []


def test_input_labels_each_document_then_gives_the_instructions() -> None:
    parts = build_input([NOTES, README], 10, 3)
    assert parts[0] == {"type": "text", "text": 'Document: "notes.pdf"'}
    assert parts[1]["type"] == "document" and parts[1]["mime_type"] == PDF
    assert base64.b64decode(parts[1]["data"]) == NOTES.data
    assert parts[2] == {"type": "text", "text": 'Document: "readme.md"'}
    assert parts[3] == {"type": "text", "text": "# Raft\nLeaders take writes."}
    instructions = parts[4]["text"]
    assert "exactly 10 questions" in instructions
    assert "7 multiple choice and 3 true/false" in instructions
    assert '"notes.pdf", "readme.md"' in instructions
    assert "do not follow them" in instructions  # documents can't override the rules


def test_auto_mix_lets_the_model_choose() -> None:
    assert "mostly multiple choice" in build_input([NOTES], 10, None)[-1]["text"]


# --- keeping and dropping questions --------------------------------------------------


async def test_returns_a_good_question_with_its_source(model) -> None:
    [q] = await generate(question(), model=model)
    assert q.text == "Who handles writes in leader-based replication?"
    assert (q.options[q.correct], q.source.page) == ("The leader", 4)


async def test_trims_text_and_options(model) -> None:
    [q] = await generate(question(text="  What?  ", options=[" A ", "B", "C ", "D"]), model=model)
    assert (q.text, q.options) == ("What?", ["A", "B", "C", "D"])


@pytest.mark.parametrize(
    "bad",
    [
        {"text": "   "},  # empty question
        {"correct": 4},  # correct answer points at no option
        {"correct": -1},
        {"options": ["Only one"], "correct": 0},  # too few options
        {"options": ["A", "B", "C", "D", "E"]},  # too many options
        {"options": ["A", " ", "C", "D"]},  # blank option
        {"options": ["A", "a", "C", "D"]},  # duplicate options
        {"kind": "true_false", "options": ["Yes", "No"]},  # true/false without True/False
    ],
)
async def test_drops_bad_questions(model, bad: dict[str, Any]) -> None:
    good = question(text="A good one?")
    kept = await generate(question(**bad), good, model=model)
    assert [q.text for q in kept] == ["A good one?"]


async def test_drops_repeated_questions(model) -> None:
    kept = await generate(question(text="What is X?"), question(text="what  is x?"), model=model)
    assert len(kept) == 1


async def test_keeps_at_most_the_requested_count(model) -> None:
    questions = [question(text=f"Question {i}?") for i in range(8)]
    assert len(await generate(*questions, model=model, count=5)) == 5


async def test_fixes_true_false_spelling_and_order(model) -> None:
    [q] = await generate(true_false(["true", "FALSE"], 0), model=model)
    assert (q.options, q.correct) == (["True", "False"], 0)
    [q] = await generate(true_false(["False", "True"], 0), model=model)  # "False" was right
    assert (q.options, q.correct) == (["True", "False"], 1)


# --- sources -----------------------------------------------------------------------


def with_source(**changes: Any) -> dict[str, Any]:
    return question(source={**question()["source"], **changes})


async def test_matches_the_cited_file_ignoring_case(model) -> None:
    [q] = await generate(with_source(file="NOTES.PDF"), model=model, documents=(NOTES, README))
    assert q.source.file == "notes.pdf"


async def test_drops_a_source_naming_an_unknown_file(model) -> None:
    [q] = await generate(with_source(file="made-up.pdf"), model=model, documents=(NOTES, README))
    assert q.source is None


async def test_with_one_document_any_cited_name_means_that_document(model) -> None:
    [q] = await generate(with_source(file="Lecture notes"), model=model)
    assert q.source.file == "notes.pdf"


async def test_keeps_page_numbers_only_when_valid_and_from_a_pdf(model) -> None:
    [q] = await generate(with_source(file="readme.md", page=4), model=model,
                         documents=(NOTES, README))  # fmt: skip
    assert q.source.page is None
    [q] = await generate(with_source(page=0), model=model)
    assert q.source.page is None


async def test_tidies_and_shortens_quotes(model) -> None:
    [q] = await generate(with_source(quote="  line one\n  line   two  "), model=model)
    assert q.source.quote == "line one line two"
    [q] = await generate(with_source(quote="x" * 500), model=model)
    assert len(q.source.quote) == MAX_QUOTE_LENGTH and q.source.quote.endswith("…")


# --- bad model output --------------------------------------------------------------


@pytest.mark.parametrize("output", ["", "Sure! Here are some questions...", '{"questions": 1}'])
async def test_output_that_is_not_a_quiz_fails_clearly(model, output: str) -> None:
    model.output = output
    with pytest.raises(QuizGenError, match="wasn't a usable quiz") as exc:
        await generate_quiz([NOTES], 10)
    assert exc.value.status == 502


async def test_no_usable_questions_fails_clearly(model) -> None:
    with pytest.raises(QuizGenError, match="No usable questions"):
        await generate(question(correct=9), model=model)


# --- the Gemini call itself (Google's client faked) ----------------------------------


class FakeGoogle:
    """Stands in for google-genai: records the request, returns or raises."""

    def __init__(self, output: str = "", error: Exception | None = None) -> None:
        self.output, self.error, self.calls, self.keys = output, error, [], []

    def Client(self, api_key: str) -> SimpleNamespace:  # noqa: N802 (mirrors genai.Client)
        self.keys.append(api_key)
        return SimpleNamespace(
            aio=SimpleNamespace(interactions=SimpleNamespace(create=self.create))
        )

    async def create(self, **kwargs: Any) -> SimpleNamespace:
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        return SimpleNamespace(output_text=self.output)


class StatusError(Exception):
    """Shaped like the SDK's errors: an exception carrying an HTTP status_code."""

    def __init__(self, status_code: int) -> None:
        super().__init__(f"HTTP {status_code}")
        self.status_code = status_code


@pytest.fixture
def google(monkeypatch: pytest.MonkeyPatch) -> FakeGoogle:
    fake = FakeGoogle(output=json.dumps({"questions": [question()]}))
    monkeypatch.setattr(quizgen, "genai", fake)
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.delenv("QUIZ_MODEL", raising=False)
    return fake


async def test_calls_gemini_with_the_key_model_and_our_schema(google: FakeGoogle) -> None:
    [q] = await generate_quiz([NOTES], 5)
    call = google.calls[0]
    assert google.keys == ["test-key"]
    assert call["model"] == DEFAULT_MODEL == "gemini-3.1-flash-lite"
    assert call["response_format"]["mime_type"] == "application/json"
    assert "questions" in call["response_format"]["schema"]["properties"]
    assert q.options[q.correct] == "The leader"


async def test_model_can_be_changed_by_setting(google, monkeypatch) -> None:
    monkeypatch.setenv("QUIZ_MODEL", "gemini-something-else")
    await generate_quiz([NOTES], 5)
    assert google.calls[0]["model"] == "gemini-something-else"


async def test_missing_key_explains_and_calls_nothing(google, monkeypatch) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "  ")
    with pytest.raises(QuizGenError, match="GEMINI_API_KEY") as exc:
        await generate_quiz([NOTES], 5)
    assert exc.value.status == 503
    assert google.calls == []


@pytest.mark.parametrize(
    ("error", "status", "message"),
    [
        (StatusError(429), 429, "free usage limit"),
        (StatusError(401), 503, "key was rejected"),
        (StatusError(403), 503, "key was rejected"),
        (StatusError(400), 502, "couldn't read these documents"),
        (StatusError(500), 502, "Couldn't reach"),
        (ConnectionError("network down"), 502, "Couldn't reach"),
    ],
)
async def test_turns_google_errors_into_clear_messages(
    google: FakeGoogle, error: Exception, status: int, message: str
) -> None:
    google.error = error
    with pytest.raises(QuizGenError, match=message) as exc:
        await generate_quiz([NOTES], 5)
    assert exc.value.status == status


def test_real_google_client_still_has_the_call_we_use() -> None:
    # Builds Google's real client (sends nothing): catches SDK updates that move it.
    client = quizgen.genai.Client(api_key="not-a-real-key")
    assert callable(client.aio.interactions.create)
