FROM python:3.11-slim

WORKDIR /app

# System dependencies for psycopg2 and cryptography
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    python3-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONUNBUFFERED=1
ENV PORT=5000
ENV FLASK_ENV=production

EXPOSE 5000

CMD ["python", "app.py"]
