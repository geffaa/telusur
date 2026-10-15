"""API tests run against the dev database seeded by `python -m scripts.seed`."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app

PASSWORD = "telusur123"


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


async def login(client: AsyncClient, workspace: str, user: str) -> dict:
    res = await client.post(
        "/auth/login",
        json={"workspace": workspace, "email": f"{user}@{workspace}.test", "password": PASSWORD},
    )
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['token']}"}
