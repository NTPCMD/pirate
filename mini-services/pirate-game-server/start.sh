#!/bin/bash
# Respawn wrapper for the pirate-game-server mini-service.
# Keeps the service alive even if the bun process exits.
cd /home/z/my-project/mini-services/pirate-game-server
while true; do
  echo "[$(date)] starting pirate-game-server..."
  bun index.ts >> /home/z/my-project/mini-services/pirate-game-server/server.log 2>&1
  echo "[$(date)] pirate-game-server exited (code $?), restarting in 2s..."
  sleep 2
done
