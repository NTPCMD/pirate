#!/bin/bash
fuser -k 3003/tcp 2>/dev/null || true

cd mini-services/pirate-game-server
npm start &

cd ../..
npm start
