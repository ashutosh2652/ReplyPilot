#!/bin/bash

# A unified script to start all 5 ReplyPilot services on both Linux and Windows

# Default ports:
# rag: 8001
# ai-service: 8000
# server: 5000
# client: 5173

# Helper function to find uvicorn from a venv (works on Windows Git Bash and Linux)
get_venv_uvicorn() {
    local service_dir=$1
    # Check for Windows virtualenv path first
    if [ -f "$service_dir/.venv/Scripts/uvicorn" ] || [ -f "$service_dir/.venv/Scripts/uvicorn.exe" ]; then
        echo "../$service_dir/.venv/Scripts/uvicorn"
    else
        echo "../$service_dir/.venv/bin/uvicorn"
    fi
}

# Trap CTRL+C (SIGINT) and kill all background processes
cleanup() {
    echo ""
    echo "Shutting down all services..."
    # The `jobs -p` command lists all PIDs of background jobs started in this shell
    kill $(jobs -p) 2>/dev/null
    wait $(jobs -p) 2>/dev/null
    echo "All services terminated safely."
    exit 0
}

# Register the cleanup function for termination signals
trap cleanup SIGINT SIGTERM

echo "Starting all ReplyPilot services..."
echo "======================================"

# 1. Start Client (Vite) on port 5173
echo "-> Starting Client on port 5173..."
cd client
PORT=5173 npm run dev &
cd ..

# 2. Start Server (Node.js) on port 5000
echo "-> Starting Server on port 5000..."
cd server
PORT=5000 npm run dev &
cd ..

# 3. Start Worker (Node.js)
echo "-> Starting Worker..."
cd worker
npm run dev &
cd ..

# 4. Start AI-Service (Uvicorn) on port 8000
echo "-> Starting AI-Service on port 8000..."
cd ai-service
UVICORN_AI=$(get_venv_uvicorn "ai-service")
$UVICORN_AI app.main:app --host 0.0.0.0 --port 8000 &
cd ..

# 5. Start RAG (Uvicorn) on port 8001
echo "-> Starting RAG on port 8001..."
cd rag
UVICORN_RAG=$(get_venv_uvicorn "rag")
$UVICORN_RAG app.main:app --host 0.0.0.0 --port 8001 &
cd ..

echo "======================================"
echo "All services started in the background!"
echo "Press Ctrl+C to stop all services at once."
wait
