from app.ratelimit import RateLimiter

DAY = 24 * 60 * 60


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def make(limit: int = 3) -> tuple[RateLimiter, Clock]:
    clock = Clock()
    return RateLimiter(limit, DAY, clock), clock


def test_allows_up_to_the_limit_then_says_how_long_to_wait() -> None:
    limiter, clock = make()
    assert [limiter.take("1.1.1.1") for _ in range(3)] == [None, None, None]
    clock.now += 60
    assert limiter.take("1.1.1.1") == DAY - 60


def test_each_key_has_its_own_turns() -> None:
    limiter, _ = make(limit=1)
    assert limiter.take("1.1.1.1") is None
    assert limiter.take("2.2.2.2") is None
    assert limiter.take("1.1.1.1") is not None


def test_turns_come_back_one_at_a_time_as_the_window_rolls() -> None:
    limiter, clock = make(limit=2)
    limiter.take("ip")
    clock.now += 100
    limiter.take("ip")
    clock.now = 1000 + DAY + 1  # only the first use has expired
    assert limiter.take("ip") is None
    assert limiter.take("ip") is not None


def test_give_back_returns_the_turn() -> None:
    limiter, _ = make(limit=1)
    limiter.take("ip")
    limiter.give_back("ip")
    assert limiter.take("ip") is None
    limiter.give_back("unknown")  # harmless


def test_forgets_keys_whose_uses_have_all_expired() -> None:
    limiter, clock = make()
    limiter.take("old")
    clock.now += DAY + 1
    limiter.take("new")
    assert list(limiter._uses) == ["new"]
