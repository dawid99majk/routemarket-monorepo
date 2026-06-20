FROM python:3.11-slim

WORKDIR /app

# Install system dependencies if required
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

EXPOSE 8501

HEALTHCHECK CMD curl --fail http://localhost:8501/atlas/health

ENTRYPOINT ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8501", "--proxy-headers"]
