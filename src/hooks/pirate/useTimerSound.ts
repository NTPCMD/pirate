'use client';

// ============================================================================
// useTimerSound — plays ticking countdown sounds during the round timer's
// final 3 seconds + a final beep when the timer hits zero.
//
// Used by BOTH the host (TimerControlPanel) and the player
// (RoundTimerIndicator) so the urgency cue is consistent across roles. The
// hook is a pure side-effect — it doesn't return anything; it just listens
// to the `remaining` + `active` props and fires sounds via the shared
// SoundManager (so it honors the global mute toggle automatically).
//
// Guards:
//   - Only fires when `active` is true (i.e. the timer is actually counting
//     down — not when paused, stopped, or unconfigured).
//   - Uses a ref to track the previously seen `remaining` so each tick fires
//     exactly once (no duplicate sounds if React re-renders).
//   - Fires `tick` when remaining transitions to 3, 2, or 1.
//   - Fires `beep` when remaining transitions to 0 (i.e. prev was 1 and now
//     it's 0, or the timer otherwise lands on 0 from a higher value).
// ============================================================================

import { useEffect, useRef } from 'react';
import { useSound } from '@/components/pirate/SoundManager';

export function useTimerSound(
  remaining: number | undefined,
  active: boolean | undefined,
): void {
  const { play } = useSound();
  // Track the last `remaining` we played a sound for so we never double-fire
  // on the same tick. Initialize to null so we don't play a stale tick on
  // mount when the timer was already counting before this component mounted.
  const prevRemainingRef = useRef<number | null>(null);
  // Track the last `active` state so we can reset the prev ref when the
  // timer stops/starts (avoids playing a phantom beep on resume).
  const prevActiveRef = useRef<boolean | undefined>(undefined);

  useEffect(() => {
    // No timer configured at all — nothing to do.
    if (remaining === undefined) return;

    const prevActive = prevActiveRef.current;
    const justActivated =
      prevActive !== undefined && !prevActive && active === true;

    // If the timer just transitioned from inactive → active, reset our
    // baseline so we don't compare against a stale value (e.g. remaining
    // jumped from 0 → 15 because the host pressed Start).
    if (justActivated) {
      prevRemainingRef.current = remaining;
      prevActiveRef.current = active;
      return;
    }

    // If the timer isn't currently counting down, don't play any sounds.
    // Just remember where we are so the next "active" cycle starts clean.
    if (!active) {
      prevRemainingRef.current = remaining;
      prevActiveRef.current = active;
      return;
    }

    const prev = prevRemainingRef.current;

    // Only fire when remaining actually decreased from a previous known
    // value. This guards against re-renders, server snapshots arriving
    // out of order, and the initial mount.
    if (prev !== null && remaining < prev) {
      // Tick on the way down through 3, 2, 1.
      if (remaining === 3 || remaining === 2 || remaining === 1) {
        play('tick');
      }
      // Beep when the timer hits zero (transition from 1 → 0, or any
      // higher value → 0 if the timer skipped for any reason).
      if (remaining <= 0 && prev > 0) {
        play('beep');
      }
    }

    prevRemainingRef.current = remaining;
    prevActiveRef.current = active;
  }, [remaining, active, play]);
}
