FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies if required (like build-essential for some python packages)
RUN apt-get update && apt-get install -y build-essential && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir torch==2.4.1 --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download embedding models to save startup time (optional but recommended for sentence-transformers to avoid timeouts on Railway)
# RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('BAAI/bge-base-en-v1.5')"

# Copy the rest of the application
COPY . .

# Expose the API port
EXPOSE 8000

# Start Uvicorn, listening on the port provided by Railway ($PORT)
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
