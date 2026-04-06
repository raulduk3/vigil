#!/bin/bash
# Vigil OpenClaw Skill Installer
# Usage: curl -sf https://vigil.run/install-skill.sh | bash
set -euo pipefail

SKILL_DIR="$HOME/.openclaw/skills/vigil"
REPO_URL="https://vigil.run"

echo "Installing Vigil skill for OpenClaw..."

# Create skill directory
mkdir -p "$SKILL_DIR/scripts"

# Download SKILL.md
echo "  Downloading SKILL.md..."
curl -sf "$REPO_URL/SKILL.md" -o "$SKILL_DIR/SKILL.md"

# Download vigil.sh
echo "  Downloading vigil.sh..."
curl -sf "$REPO_URL/vigil.sh" -o "$SKILL_DIR/scripts/vigil.sh"
chmod +x "$SKILL_DIR/scripts/vigil.sh"

echo ""
echo "✓ Installed to $SKILL_DIR"
echo ""

# Check for API key
if [ -z "${VIGIL_API_KEY:-}" ]; then
  echo "Next: set your API key."
  echo ""
  echo "  export VIGIL_API_KEY=\"vk_your_key_here\""
  echo ""
  echo "Get one at https://vigil.run/account/developer"
else
  echo "✓ VIGIL_API_KEY is set"
  echo ""
  echo "Try: vigil.sh status"
fi
