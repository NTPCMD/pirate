#!/bin/bash
cd mini-services/pirate-game-server
npm start &
cd ../..
npm run dev -- --host 0.0.0.0
