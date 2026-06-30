'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Send, MessageCircle, X, ChevronDown } from 'lucide-react';
import { useGameStore } from '@/hooks/pirate/useGameStore';
import { useSound } from '@/components/pirate/SoundManager';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/lib/pirate/types';

const ROLE_BADGE: Record<ChatMessage['role'], { label: string; cls: string }> = {
  host: { label: 'HOST', cls: 'border-gold/40 text-gold bg-gold/10' },
  player: { label: '', cls: '' },
  spectator: { label: 'WATCH', cls: 'border-ocean/40 text-ocean bg-ocean/10' },
};

function formatTime(at: number): string {
  const d = new Date(at);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function ChatPanel({ compact = false }: { compact?: boolean }) {
  const messages = useGameStore((s) => s.chatMessages);
  const sendChat = useGameStore((s) => s.sendChat);
  const { play } = useSound();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(compact);
  const [unread, setUnread] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMsgId = useRef<string | null>(null);

  // Auto-scroll to bottom on new messages when open
  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  // Track unread when collapsed
  useEffect(() => {
    if (messages.length > 0) {
      const last = messages[messages.length - 1];
      if (last.id !== lastMsgId.current) {
        lastMsgId.current = last.id;
        if (!open) setUnread((u) => u + 1);
      }
    }
  }, [messages, open]);

  const handleSend = () => {
    const t = text.trim();
    if (!t) return;
    sendChat(t);
    play('click');
    setText('');
  };

  const handleToggle = () => {
    setOpen((o) => !o);
    if (!open) setUnread(0);
    play('click');
  };

  if (compact) {
    // Inline (always-open) variant — used inside panels
    return (
      <div className="flex flex-col h-full min-h-0">
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto scroll-thin space-y-2 pr-1 min-h-0"
          role="log"
          aria-label="Chat messages"
        >
          {messages.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-4">
              No messages yet. Say ahoy!
            </p>
          ) : (
            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-sm"
                >
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span className="font-semibold text-xs">
                      {msg.playerName}
                    </span>
                    {ROLE_BADGE[msg.role].label && (
                      <span className={cn('rounded border px-1 text-[8px] font-bold leading-tight py-0', ROLE_BADGE[msg.role].cls)}>
                        {ROLE_BADGE[msg.role].label}
                      </span>
                    )}
                    <span className="text-[9px] text-muted-foreground tabular-nums">
                      {formatTime(msg.at)}
                    </span>
                  </div>
                  <p className="text-xs text-foreground/90 break-words leading-snug">
                    {msg.text}
                  </p>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
        <div className="flex gap-1.5 pt-2 shrink-0">
          <input
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 200))}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Type a message…"
            maxLength={200}
            className="flex-1 rounded-lg border border-border bg-background/60 px-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-gold/40"
            aria-label="Chat input"
          />
          <button
            onClick={handleSend}
            disabled={!text.trim()}
            className="shrink-0 rounded-lg bg-gold/90 hover:bg-gold text-gold-foreground p-2 disabled:opacity-40 transition-colors"
            aria-label="Send message"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // Floating collapsible variant — used as an overlay panel
  return (
    <>
      {/* Toggle button */}
      <button
        onClick={handleToggle}
        className="fixed bottom-16 right-4 z-40 flex items-center gap-2 rounded-full border border-gold/40 bg-card/90 backdrop-blur-sm px-4 py-2.5 shadow-lg hover:bg-gold/10 transition-colors btn-pirate"
        aria-label={open ? 'Close chat' : 'Open chat'}
        aria-expanded={open}
      >
        <MessageCircle className="h-4 w-4 text-gold" />
        <span className="text-xs font-semibold">Chat</span>
        {unread > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
            className="fixed bottom-28 right-4 z-40 w-[88vw] max-w-sm h-[60vh] max-h-96 pirate-card flex flex-col overflow-hidden"
            role="dialog"
            aria-label="Chat panel"
          >
            <header className="flex items-center justify-between border-b border-border/60 px-4 py-2.5 shrink-0">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-gold" />
                <span className="text-sm font-semibold">Crew Chat</span>
              </div>
              <button
                onClick={handleToggle}
                className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-foreground/10"
                aria-label="Close chat"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="flex-1 px-4 py-2 min-h-0">
              <ChatPanel compact />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
