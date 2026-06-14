FROM python:3.12-slim

WORKDIR /app/mcp

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY __init__.py __main__.py bootstrap.py cache.py client.py config.py models.py rate_limit.py server.py stdio_server.py server/ ./

ENV CARRIER_API_BASE_URL=http://host.docker.internal:8000

CMD ["python", "server.py"]
