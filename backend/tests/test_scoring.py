import pytest

from app.scoring import is_late, score_answer

TIME_LIMIT = 20


def test_correct_at_4s_gives_900() -> None:
    assert score_answer(True, 4, TIME_LIMIT) == 900


def test_correct_at_deadline_gives_500() -> None:
    assert score_answer(True, 20, TIME_LIMIT) == 500


def test_correct_instantly_gives_1000() -> None:
    assert score_answer(True, 0, TIME_LIMIT) == 1000


def test_wrong_answer_gives_0() -> None:
    assert score_answer(False, 4, TIME_LIMIT) == 0


def test_late_answer_gives_0() -> None:
    assert score_answer(True, 20.001, TIME_LIMIT) == 0


def test_is_late_only_after_deadline() -> None:
    assert not is_late(20, TIME_LIMIT)
    assert is_late(20.001, TIME_LIMIT)


def test_non_positive_time_limit_rejected() -> None:
    with pytest.raises(ValueError):
        score_answer(True, 1, 0)
