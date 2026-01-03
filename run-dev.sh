#!/bin/bash
# Vigil Development Runner
# Runs backend in background with logging, then starts frontend

set -e

# Ensure bun is in PATH
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
LOG_FILE="$BACKEND_DIR/logs/dev-server.log"
PID_FILE="$BACKEND_DIR/logs/backend.pid"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

cleanup() {
    echo -e "\n${YELLOW}Shutting down...${NC}"
    if [ -f "$PID_FILE" ]; then
        BACKEND_PID=$(cat "$PID_FILE")
        if kill -0 "$BACKEND_PID" 2>/dev/null; then
            echo -e "${YELLOW}Stopping backend (PID: $BACKEND_PID)...${NC}"
            kill "$BACKEND_PID" 2>/dev/null || true
        fi
        rm -f "$PID_FILE"
    fi
    exit 0
}

trap cleanup SIGINT SIGTERM

echo -e "${GREEN}🚀 Starting Vigil Development Environment${NC}"

# Kill any existing processes on our ports
echo -e "${YELLOW}Cleaning up existing processes...${NC}"
lsof -ti :3001 | xargs kill -9 2>/dev/null || true
lsof -ti :3000 | xargs kill -9 2>/dev/null || true
sleep 1

# Ensure log directory exists
mkdir -p "$BACKEND_DIR/logs"

# Start backend in background - use subshell to detach
echo -e "${YELLOW}Starting backend server on port 3001...${NC}"
cd "$BACKEND_DIR"
( bun run --watch src/index.ts >> "$LOG_FILE" 2>&1 ) &
BACKEND_PID=$!
disown $BACKEND_PID 2>/dev/null || true
echo "$BACKEND_PID" > "$PID_FILE"
echo "Backend PID: $BACKEND_PID"

# Wait for backend to be ready
echo -e "${YELLOW}Waiting for backend to start...${NC}"
for i in {1..30}; do
    if curl -s http://localhost:3001/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Backend is ready!${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}✗ Backend failed to start. Check logs: $LOG_FILE${NC}"
        tail -20 "$LOG_FILE"
        exit 1
    fi
    sleep 1
done

echo ""
echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}Backend running in background${NC}"
echo -e "  PID: $BACKEND_PID"
echo -e "  URL: http://localhost:3001"
echo -e "  Logs: $LOG_FILE"
echo -e "${GREEN}================================${NC}"
echo ""

# Start frontend in foreground
echo -e "${YELLOW}Starting frontend server on port 3000...${NC}"
cd "$FRONTEND_DIR"
npm run dev
