#!/bin/bash
cd /home/z/my-project/mini-services/pirate-game-server
bun --hot index.ts &
cd /home/z/my-project
bun run dev &
wait