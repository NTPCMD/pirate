---
Task ID: 1
Agent: Main
Task: Remove chat feature from Pirate Game

Work Log:
- Removed ChatPanel imports from HostDashboard.tsx, PlayerGame.tsx, SpectatorView.tsx
- Removed <ChatPanel /> usage from all three components
- Removed chatMessages state, sendChat action, and chat socket listener from useGameStore.ts
- Removed ChatMessage type import from useGameStore.ts
- Removed chat event handler (playerChat) from pirate-game-server/index.ts
- Removed addChatMessage method from pirate-game-server/src/engine.ts
- Removed chatMessages field from GameSession interface in engine.ts
- Removed ChatMessage import from engine.ts
- ChatPanel.tsx file left in place (no longer imported, won't be bundled)

Stage Summary:
- Chat feature fully removed from frontend and backend
- Game verified working via agent-browser — no chat panel visible
- Σ(Cor)²an logo displays correctly on RoleSelect page