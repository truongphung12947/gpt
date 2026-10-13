FROM python:3.13-slim
WORKDIR /app
RUN pip install --no-cache-dir uv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY agent.py models.py webapp.py langgraph.json ./
# langgraph.json lists ".env"; secrets arrive as environment variables instead.
RUN touch .env
EXPOSE 2024
CMD ["uv", "run", "langgraph", "dev", "--host", "0.0.0.0", "--port", "2024", "--no-browser", "--no-reload"]
