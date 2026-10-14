"""Durable chat state: LangGraph checkpoints (messages, UI cards) live in Postgres.

Used through `checkpointer.path` in langgraph.json. Without DATABASE_URL (local dev) it
falls back to memory, like before.
"""
import os
from contextlib import asynccontextmanager

from langgraph.checkpoint.memory import InMemorySaver


@asynccontextmanager
async def generate_checkpointer():
    url = os.environ.get("DATABASE_URL")
    if not url:
        yield InMemorySaver()
        return

    from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
    from psycopg.rows import dict_row
    from psycopg_pool import AsyncConnectionPool

    async with AsyncConnectionPool(
        url,
        min_size=1,
        max_size=5,
        open=False,
        # Azure closes idle connections; test each one before handing it out.
        check=AsyncConnectionPool.check_connection,
        kwargs={"autocommit": True, "prepare_threshold": 0, "row_factory": dict_row},
    ) as pool:
        saver = AsyncPostgresSaver(pool)
        await saver.setup()
        yield saver
