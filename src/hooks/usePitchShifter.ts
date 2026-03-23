"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface UsePitchShifterOptions {
  songId: string | null;
  audioUrl: string | null;
  pitch: number;
  tempo: number;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  onPause: () => void;
}

export function usePitchShifter({
  songId,
  audioUrl,
  pitch,
  tempo,
  audioRef,
  onPause,
}: UsePitchShifterOptions) {
  const [processing, setProcessing] = useState(false);
  const [pitchedUrl, setPitchedUrl] = useState<string | null>(null);
  const activePitchRef = useRef(0);

  // When pitch changes, pause and process
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Always pause when pitch changes
    if (pitch !== activePitchRef.current) {
      onPause();
    }
    activePitchRef.current = pitch;

    if (pitch === 0) {
      // Restore original audio
      if (audioUrl && audio.src !== new URL(audioUrl, window.location.origin).href) {
        const pos = audio.currentTime;
        audio.src = audioUrl;
        audio.currentTime = pos;
      }
      audio.preservesPitch = true;
      audio.playbackRate = tempo;
      setPitchedUrl(null);
      setProcessing(false);
      return;
    }

    if (!songId) return;

    // Request server-side pitch processing
    let cancelled = false;
    setProcessing(true);

    fetch(`/api/songs/${songId}/pitch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ semitones: pitch }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Pitch processing failed");
        return res.json();
      })
      .then(({ filename }) => {
        if (cancelled) return;
        const newUrl = `/api/media/${filename}`;
        setPitchedUrl(newUrl);
        setProcessing(false);

        // Swap the audio source
        const a = audioRef.current;
        if (a) {
          const pos = a.currentTime;
          a.src = newUrl;
          a.currentTime = pos;
          a.preservesPitch = true;
          a.playbackRate = tempo;
        }
      })
      .catch(() => {
        if (!cancelled) setProcessing(false);
      });

    return () => { cancelled = true; };
  }, [pitch, songId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update tempo on the audio element
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = tempo;
  }, [tempo, audioRef]);

  return { processing, pitchedUrl };
}
