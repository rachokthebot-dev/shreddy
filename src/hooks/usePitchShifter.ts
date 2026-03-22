"use client";

import { useEffect, useRef, useCallback } from "react";
import { PitchShifter } from "soundtouchjs";

interface UsePitchShifterOptions {
  audioUrl: string | null;
  pitch: number; // semitones (-6 to +6)
  tempo: number; // playback rate multiplier
  audioRef: React.RefObject<HTMLAudioElement | null>;
  playing: boolean;
}

/**
 * Uses SoundTouch to pitch-shift audio without changing duration.
 * When pitch !== 0, mutes the <audio> element and plays through SoundTouch.
 * When pitch === 0, does nothing (normal <audio> playback).
 */
export function usePitchShifter({
  audioUrl,
  pitch,
  tempo,
  audioRef,
  playing,
}: UsePitchShifterOptions) {
  const ctxRef = useRef<AudioContext | null>(null);
  const shifterRef = useRef<PitchShifter | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const loadedUrlRef = useRef<string | null>(null);
  const seekSyncRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeRef = useRef(false);

  // Load audio buffer when URL changes
  useEffect(() => {
    if (!audioUrl) return;
    if (loadedUrlRef.current === audioUrl && bufferRef.current) return;

    let cancelled = false;
    const ctx = ctxRef.current ?? new AudioContext();
    ctxRef.current = ctx;

    fetch(audioUrl)
      .then((res) => res.arrayBuffer())
      .then((arr) => ctx.decodeAudioData(arr))
      .then((buffer) => {
        if (cancelled) return;
        bufferRef.current = buffer;
        loadedUrlRef.current = audioUrl;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [audioUrl]);

  // Cleanup old shifter
  const destroyShifter = useCallback(() => {
    if (seekSyncRef.current) {
      clearInterval(seekSyncRef.current);
      seekSyncRef.current = null;
    }
    if (shifterRef.current) {
      try {
        shifterRef.current.disconnect();
      } catch {}
      shifterRef.current = null;
    }
    if (gainRef.current) {
      try {
        gainRef.current.disconnect();
      } catch {}
      gainRef.current = null;
    }
    activeRef.current = false;
  }, []);

  // Main effect: create/update pitch shifter
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // No pitch shift needed — ensure audio is unmuted and clean up
    if (pitch === 0) {
      audio.muted = false;
      audio.playbackRate = tempo;
      audio.preservesPitch = true;
      destroyShifter();
      return;
    }

    const buffer = bufferRef.current;
    const ctx = ctxRef.current;
    if (!buffer || !ctx) {
      // Buffer not loaded yet — keep normal playback
      audio.preservesPitch = true;
      audio.playbackRate = tempo;
      return;
    }

    // Mute the HTML audio element — SoundTouch will produce audio
    audio.muted = true;
    audio.playbackRate = tempo;
    audio.preservesPitch = true;

    // Clean up previous shifter
    destroyShifter();

    // Create new pitch shifter
    const shifter = new PitchShifter(ctx, buffer, 4096);
    shifter.pitchSemitones = pitch;
    shifter.tempo = tempo;

    // Connect through a gain node for volume control
    const gain = ctx.createGain();
    gain.gain.value = 1.0;
    shifter.connect(gain);
    gain.connect(ctx.destination);

    shifterRef.current = shifter;
    gainRef.current = gain;
    activeRef.current = true;

    // Sync SoundTouch position with <audio> element position
    // Set initial position
    const setShifterPosition = () => {
      if (!shifterRef.current || !audioRef.current) return;
      const pct = (audioRef.current.currentTime / buffer.duration) * 100;
      shifterRef.current.percentagePlayed = pct;
    };

    setShifterPosition();

    // Periodically sync position (handles seeking)
    seekSyncRef.current = setInterval(() => {
      if (!shifterRef.current || !audioRef.current) return;
      const stTime = shifterRef.current.timePlayed;
      const audioTime = audioRef.current.currentTime;
      // If positions diverge by more than 0.3s, re-sync
      if (Math.abs(stTime - audioTime) > 0.3) {
        setShifterPosition();
      }
    }, 100);

    return () => {
      destroyShifter();
      if (audioRef.current) {
        audioRef.current.muted = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pitch, tempo, bufferRef.current]);

  // Handle play/pause — suspend/resume AudioContext
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx || !activeRef.current) return;

    if (playing) {
      ctx.resume();
    } else {
      ctx.suspend();
    }
  }, [playing]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      destroyShifter();
      if (ctxRef.current) {
        ctxRef.current.close().catch(() => {});
        ctxRef.current = null;
      }
    };
  }, [destroyShifter]);
}
