#!/bin/sh
# Copy test script into agent container and run E2E Gemini test
# Usage: ./scripts/test-gemini.sh
set -e
SERVER="root@160.250.131.12"
SERVER_PASS='Tkep2h0NavMPcY9v'
SCRIPT="scripts/test-gemini-mini.js"

echo "==> Copying $SCRIPT to VPS..."
sshpass -p "$SERVER_PASS" rsync -avz "$SCRIPT" "$SERVER:/tmp/gmini.js" >/dev/null

echo "==> Injecting into ai_social_agent_1..."
sshpass -p "$SERVER_PASS" ssh -o StrictHostKeyChecking=no "$SERVER" \
  "docker cp /tmp/gmini.js ai_social_agent_1:/tmp/gmini.js && \
   docker exec ai_social_agent_1 node /tmp/gmini.js"
