'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

type SoundName =
  | 'reveal'
  | 'cash'
  | 'bigcash'
  | 'power'
  | 'anchor'
  | 'fire'
  | 'splash'
  | 'shield'
  | 'mirror'
  | 'bank'
  | 'multiplier'
  | 'steal'
  | 'lose'
  | 'click'
  | 'join'
  | 'win'
  | 'error'
  | 'tick' // short high-pitched click for the last-3-seconds countdown
  | 'beep'; // slightly longer mid-pitched tone for when the timer hits zero

interface SoundCtx {
  muted: boolean;
  toggleMute: () => void;
  play: (name: SoundName) => void;
}

const Ctx = createContext<SoundCtx>({
  muted: false,
  toggleMute: () => {},
  play: () => {},
});

export function useSound() {
  return useContext(Ctx);
}

export function SoundProvider({ children }: { children: React.ReactNode }) {
  const [muted, setMuted] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem('pirate-muted') === '1';
    } catch {
      return false;
    }
  });
  const ctxRef = useRef<AudioContext | null>(null);

  const getCtx = useCallback(() => {
    if (typeof window === 'undefined') return null;
    if (!ctxRef.current) {
      try {
        ctxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch {
        return null;
      }
    }
    if (ctxRef.current.state === 'suspended') void ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  const tone = useCallback(
    (
      ctx: AudioContext,
      freq: number,
      start: number,
      dur: number,
      type: OscillatorType = 'sine',
      gain = 0.18,
    ) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
      g.gain.setValueAtTime(0, ctx.currentTime + start);
      g.gain.linearRampToValueAtTime(gain, ctx.currentTime + start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur + 0.02);
    },
    [],
  );

  const noise = useCallback(
    (ctx: AudioContext, start: number, dur: number, gain = 0.12, filterFreq = 1000) => {
      const bufferSize = Math.floor(ctx.sampleRate * dur);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, ctx.currentTime + start);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
      src.connect(filter);
      filter.connect(g);
      g.connect(ctx.destination);
      src.start(ctx.currentTime + start);
      src.stop(ctx.currentTime + start + dur);
    },
    [],
  );

  const play = useCallback(
    (name: SoundName) => {
      if (muted) return;
      const ctx = getCtx();
      if (!ctx) return;
      switch (name) {
        case 'click':
          tone(ctx, 600, 0, 0.06, 'square', 0.08);
          break;
        case 'reveal':
          tone(ctx, 440, 0, 0.12, 'triangle', 0.12);
          tone(ctx, 660, 0.05, 0.12, 'triangle', 0.1);
          break;
        case 'cash':
          tone(ctx, 880, 0, 0.08, 'sine', 0.14);
          tone(ctx, 1175, 0.06, 0.1, 'sine', 0.12);
          break;
        case 'bigcash':
          tone(ctx, 523, 0, 0.12, 'sine', 0.16);
          tone(ctx, 659, 0.1, 0.12, 'sine', 0.16);
          tone(ctx, 784, 0.2, 0.12, 'sine', 0.16);
          tone(ctx, 1047, 0.3, 0.2, 'sine', 0.18);
          break;
        case 'power':
          tone(ctx, 300, 0, 0.15, 'sawtooth', 0.1);
          tone(ctx, 500, 0.08, 0.15, 'sawtooth', 0.1);
          break;
        case 'multiplier':
          tone(ctx, 392, 0, 0.1, 'square', 0.12);
          tone(ctx, 523, 0.08, 0.1, 'square', 0.12);
          tone(ctx, 659, 0.16, 0.1, 'square', 0.12);
          tone(ctx, 880, 0.24, 0.18, 'square', 0.14);
          break;
        case 'anchor':
          tone(ctx, 200, 0, 0.3, 'sawtooth', 0.14);
          noise(ctx, 0, 0.3, 0.08, 600);
          break;
        case 'steal':
          tone(ctx, 700, 0, 0.1, 'square', 0.12);
          tone(ctx, 900, 0.1, 0.12, 'square', 0.12);
          tone(ctx, 1200, 0.22, 0.16, 'square', 0.12);
          break;
        case 'fire':
          noise(ctx, 0, 0.5, 0.16, 800);
          tone(ctx, 150, 0, 0.4, 'sawtooth', 0.1);
          break;
        case 'splash':
          noise(ctx, 0, 0.4, 0.14, 1200);
          tone(ctx, 400, 0.1, 0.3, 'sine', 0.08);
          break;
        case 'shield':
          tone(ctx, 600, 0, 0.15, 'sine', 0.12);
          tone(ctx, 800, 0.1, 0.2, 'sine', 0.12);
          tone(ctx, 1000, 0.2, 0.25, 'sine', 0.1);
          break;
        case 'mirror':
          tone(ctx, 1200, 0, 0.1, 'sine', 0.1);
          tone(ctx, 900, 0.08, 0.1, 'sine', 0.1);
          tone(ctx, 1500, 0.16, 0.2, 'sine', 0.12);
          break;
        case 'bank':
          tone(ctx, 700, 0, 0.1, 'sine', 0.14);
          tone(ctx, 900, 0.08, 0.1, 'sine', 0.12);
          tone(ctx, 1100, 0.16, 0.2, 'sine', 0.12);
          break;
        case 'lose':
          tone(ctx, 400, 0, 0.2, 'sawtooth', 0.12);
          tone(ctx, 300, 0.15, 0.25, 'sawtooth', 0.12);
          tone(ctx, 200, 0.3, 0.35, 'sawtooth', 0.12);
          break;
        case 'join':
          tone(ctx, 523, 0, 0.1, 'sine', 0.12);
          tone(ctx, 784, 0.1, 0.15, 'sine', 0.12);
          break;
        case 'win':
          tone(ctx, 523, 0, 0.15, 'sine', 0.16);
          tone(ctx, 659, 0.15, 0.15, 'sine', 0.16);
          tone(ctx, 784, 0.3, 0.15, 'sine', 0.16);
          tone(ctx, 1047, 0.45, 0.3, 'sine', 0.18);
          break;
        case 'error':
          tone(ctx, 200, 0, 0.2, 'square', 0.12);
          tone(ctx, 160, 0.1, 0.25, 'square', 0.12);
          break;
        case 'tick':
          // Short, urgent high-pitched click for the final 3-2-1 countdown.
          tone(ctx, 1200, 0, 0.04, 'square', 0.06);
          break;
        case 'beep':
          // Slightly longer mid-pitched tone when the timer hits zero.
          tone(ctx, 880, 0, 0.12, 'sine', 0.1);
          break;
      }
    },
    [muted, getCtx, tone, noise],
  );

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const nm = !m;
      try {
        localStorage.setItem('pirate-muted', nm ? '1' : '0');
      } catch {}
      return nm;
    });
  }, []);

  useEffect(() => {
    // unlock audio on first interaction
    const unlock = () => {
      getCtx();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [getCtx]);

  return <Ctx.Provider value={{ muted, toggleMute, play }}>{children}</Ctx.Provider>;
}
