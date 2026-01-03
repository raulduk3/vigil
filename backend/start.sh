#!/bin/bash
# Vigil Backend Startup Script

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Starting Vigil Backend Development Server${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Check if .env exists
if [ ! -f ".env" ]; then
    echo -e "${GREEN}Creating .env file from .env.example...${NC}"
    cp .env.example .env
fi

# Check if PostgreSQL is running
if ! brew services list | grep postgresql@14 | grep started > /dev/null; then
    echo -e "${GREEN}Starting PostgreSQL...${NC}"
    brew services start postgresql@14
    sleep 2
fi

# Check if database exists
if ! /opt/homebrew/opt/postgresql@14/bin/psql -lqt | cut -d \| -f 1 | grep -qw vigil; then
    echo -e "${GREEN}Creating vigil database...${NC}"
    /opt/homebrew/opt/postgresql@14/bin/createdb vigil
    /opt/homebrew/opt/postgresql@14/bin/psql -d vigil -c "CREATE USER vigil WITH PASSWORD 'vigil';" 2>/dev/null || true
    /opt/homebrew/opt/postgresql@14/bin/psql -d vigil -c "GRANT ALL PRIVILEGES ON DATABASE vigil TO vigil;"
    /opt/homebrew/opt/postgresql@14/bin/psql -d vigil -c "GRANT ALL ON SCHEMA public TO vigil;"
fi

echo -e "${GREEN}Starting Vigil backend server...${NC}"
echo ""

# Start the server (without --hot to avoid port conflict with Bun.serve())
bun src/index.ts
