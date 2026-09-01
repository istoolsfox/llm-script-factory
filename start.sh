#!/bin/bash

# Get the absolute path of the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "Starting Script Factory AI..."

# Check backend virtual environment
if [ ! -d "backend/.venv" ]; then
    echo "[ERROR] Backend venv not found. Please run install.sh first."
    exit 1
fi

# Start backend
echo "Starting backend service..."
cd backend
source .venv/bin/activate
uvicorn main:app --host 127.0.0.1 --port 8000 > ../backend.log 2>&1 &
BACKEND_PID=$!
echo "   Backend PID: $BACKEND_PID (log: backend.log)"
cd ..

# Wait for backend to initialize
sleep 2

# Start frontend
echo "Starting frontend service..."
cd frontend
# Check node_modules
if [ ! -d "node_modules" ]; then
    echo "[ERROR] frontend/node_modules not found. Please run npm install."
    kill $BACKEND_PID 2>/dev/null
    exit 1
fi

# Check production build
if [ ! -d ".next" ]; then
    echo "   Production build (.next) not found. Building frontend..."
    npm run build > ../frontend-build.log 2>&1 || {
        echo "[ERROR] Frontend build failed. See frontend-build.log"
        kill $BACKEND_PID 2>/dev/null
        exit 1
    }
    echo "   Frontend build complete"
fi

npm run start > ../frontend.log 2>&1 &
FRONTEND_PID=$!
echo "   Frontend PID: $FRONTEND_PID (log: frontend.log)"
cd ..

# Wait for frontend to start
sleep 3

# Open browser
echo "Opening browser..."
open "http://127.0.0.1:3000"

echo ""
echo "Services started!"
echo "   - Backend log: backend.log"
echo "   - Frontend log: frontend.log"
echo "Press Ctrl+C to stop all services"

# Trap exit signals to cleanup child processes
cleanup() {
    echo ""
    echo "Stopping services..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    exit
}

trap cleanup SIGINT SIGTERM

# Keep script running
wait
