"""
Pytest fixtures — Solar Rota backend test suite.

Rate limit sayaçları her test öncesinde sıfırlanır; böylece testler
birbirinin limit kotasını tüketmez.
"""
import pytest

from backend.rate_limit import limiter


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """Her testten önce in-memory rate limit sayaçlarını sıfırla."""
    limiter._storage.reset()
    yield
