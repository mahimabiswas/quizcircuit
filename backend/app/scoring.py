"""Pure scoring functions. No I/O, no clocks: callers pass server-measured times.

Formula (docs/protocol.md):
    points = round(1000 * (1 - time_used / time_limit / 2)) if correct, else 0
"""

MAX_POINTS = 1000


def is_late(time_used: float, time_limit: float) -> bool:
    """True if the answer arrived after the deadline (strictly past time_limit)."""
    return time_used > time_limit


def score_answer(correct: bool, time_used: float, time_limit: float) -> int:
    """Points for one answer.

    time_used: seconds from the server sending the question to receiving the answer.
    time_limit: seconds allowed for the question.
    """
    if time_limit <= 0:
        raise ValueError("time_limit must be positive")
    if not correct or is_late(time_used, time_limit):
        return 0
    time_used = max(time_used, 0.0)
    return round(MAX_POINTS * (1 - time_used / time_limit / 2))
