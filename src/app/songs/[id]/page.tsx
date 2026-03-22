"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { use } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Section {
  id: string;
  name: string;
  startSec: number;
  endSec: number;
  orderIndex: number;
  autoDetected: boolean;
}

interface Song {
  id: string;
  title: string;
  normalizedAudioPath: string | null;
  durationSec: number | null;
  processingStatus: string;
  sections: Section[];
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const TEMPO_VALUES = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2];

export default function PracticePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [song, setSong] = useState<Song | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [tempo, setTempo] = useState(1.0);
  const [pitch, setPitch] = useState(0);
  const [loopSection, setLoopSection] = useState<Section | null>(null);
  const [loopEnabled, setLoopEnabled] = useState(false);

  // Section editor
  const [sectionDialogOpen, setSectionDialogOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<Section | null>(null);
  const [sectionName, setSectionName] = useState("");
  const [sectionStart, setSectionStart] = useState("");
  const [sectionEnd, setSectionEnd] = useState("");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const pitchNodeRef = useRef<AudioWorkletNode | null>(null);
  // Track if Web Audio is connected
  const webAudioConnectedRef = useRef(false);

  const fetchSong = useCallback(async () => {
    const res = await fetch(`/api/songs/${id}`);
    if (res.ok) {
      const data = await res.json();
      setSong(data);
    }
  }, [id]);

  useEffect(() => {
    fetchSong();
  }, [fetchSong]);

  // Set up audio element
  useEffect(() => {
    if (!song?.normalizedAudioPath) return;

    const audio = new Audio(`/api/media/${song.normalizedAudioPath}`);
    audio.preload = "auto";
    audioRef.current = audio;

    audio.addEventListener("loadedmetadata", () => {
      setDuration(audio.duration);
    });

    audio.addEventListener("timeupdate", () => {
      setCurrentTime(audio.currentTime);
    });

    audio.addEventListener("ended", () => {
      setPlaying(false);
    });

    return () => {
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, [song?.normalizedAudioPath]);

  // Handle looping
  useEffect(() => {
    if (!audioRef.current || !loopEnabled || !loopSection) return;

    const audio = audioRef.current;
    const handleTimeUpdate = () => {
      if (audio.currentTime >= loopSection.endSec) {
        audio.currentTime = loopSection.startSec;
      }
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    return () => audio.removeEventListener("timeupdate", handleTimeUpdate);
  }, [loopEnabled, loopSection]);

  // Handle tempo changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = tempo;
    }
  }, [tempo]);

  // Handle pitch changes using Web Audio API
  useEffect(() => {
    if (!audioRef.current || pitch === 0) {
      // Disconnect pitch processing if pitch is 0
      if (webAudioConnectedRef.current && audioContextRef.current && sourceRef.current) {
        try {
          sourceRef.current.disconnect();
          sourceRef.current.connect(audioContextRef.current.destination);
        } catch { /* ignore */ }
      }
      if (audioRef.current) {
        audioRef.current.preservesPitch = true;
      }
      return;
    }

    // Use preservesPitch = false and adjust playbackRate to shift pitch
    // This is a simplified approach: pitch shift = tempo * 2^(semitones/12)
    // To keep tempo constant while shifting pitch, we'd need a more complex setup.
    // For v1, we use the simpler approach of disabling preservesPitch.
    const audio = audioRef.current;
    audio.preservesPitch = false;
    // Adjust playback rate to achieve pitch shift while maintaining tempo
    // pitchRatio = 2^(semitones/12), combined with tempo
    const pitchRatio = Math.pow(2, pitch / 12);
    audio.playbackRate = tempo * pitchRatio;

    return () => {
      if (audioRef.current) {
        audioRef.current.preservesPitch = true;
        audioRef.current.playbackRate = tempo;
      }
    };
  }, [pitch, tempo]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.play();
    }
    setPlaying(!playing);
  }

  function seek(value: number | readonly number[]) {
    const audio = audioRef.current;
    if (!audio) return;
    const v = Array.isArray(value) ? value[0] : value;
    audio.currentTime = v;
    setCurrentTime(v);
  }

  function jumpToStart() {
    const audio = audioRef.current;
    if (!audio) return;
    if (loopEnabled && loopSection) {
      audio.currentTime = loopSection.startSec;
    } else {
      audio.currentTime = 0;
    }
    setCurrentTime(audio.currentTime);
  }

  function selectSection(section: Section) {
    setLoopSection(section);
    setLoopEnabled(true);
    if (audioRef.current) {
      audioRef.current.currentTime = section.startSec;
      setCurrentTime(section.startSec);
    }
  }

  function clearLoop() {
    setLoopSection(null);
    setLoopEnabled(false);
  }

  function openNewSection() {
    setEditingSection(null);
    setSectionName("");
    setSectionStart(formatTime(currentTime));
    setSectionEnd(formatTime(Math.min(currentTime + 30, duration)));
    setSectionDialogOpen(true);
  }

  function openEditSection(section: Section) {
    setEditingSection(section);
    setSectionName(section.name);
    setSectionStart(formatTime(section.startSec));
    setSectionEnd(formatTime(section.endSec));
    setSectionDialogOpen(true);
  }

  function parseTime(str: string): number {
    const parts = str.split(":").map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 1) return parts[0];
    return 0;
  }

  async function saveSection() {
    const startSec = parseTime(sectionStart);
    const endSec = parseTime(sectionEnd);

    if (!sectionName.trim() || endSec <= startSec) return;

    if (editingSection) {
      await fetch(`/api/sections/${editingSection.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: sectionName, startSec, endSec }),
      });
    } else {
      await fetch(`/api/songs/${id}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: sectionName, startSec, endSec }),
      });
    }

    setSectionDialogOpen(false);
    await fetchSong();
  }

  async function deleteSection(sectionId: string) {
    await fetch(`/api/sections/${sectionId}`, { method: "DELETE" });
    if (loopSection?.id === sectionId) {
      clearLoop();
    }
    await fetchSong();
  }

  function setStartToCurrent() {
    setSectionStart(formatTime(currentTime));
  }

  function setEndToCurrent() {
    setSectionEnd(formatTime(currentTime));
  }

  if (!song) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-neutral-400">Loading...</p>
      </main>
    );
  }

  if (song.processingStatus !== "ready") {
    return (
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
        <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-700 mb-4 block">
          ← Library
        </Link>
        <h1 className="text-xl font-semibold mb-4">{song.title}</h1>
        <p className="text-neutral-400">Song is {song.processingStatus}...</p>
      </main>
    );
  }

  return (
    <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-neutral-400 hover:text-neutral-600 text-lg">
          ←
        </Link>
        <h1 className="text-xl font-semibold truncate">{song.title}</h1>
      </div>

      {/* Progress bar */}
      <div className="mb-2">
        <Slider
          min={0}
          max={duration || 100}
          step={0.1}
          value={[currentTime]}
          onValueChange={seek}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-neutral-500 mt-1">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Playback controls */}
      <div className="flex items-center justify-center gap-4 mb-6">
        <Button variant="outline" size="sm" onClick={jumpToStart}>
          ⏮
        </Button>
        <Button
          size="lg"
          className="h-14 w-14 rounded-full text-xl"
          onClick={togglePlay}
        >
          {playing ? "⏸" : "▶"}
        </Button>
      </div>

      {/* Loop indicator */}
      {loopEnabled && loopSection && (
        <div className="flex items-center justify-center gap-2 mb-4 text-sm">
          <span className="text-blue-600 font-medium">
            🔁 Looping: {loopSection.name} ({formatTime(loopSection.startSec)} – {formatTime(loopSection.endSec)})
          </span>
          <button onClick={clearLoop} className="text-neutral-400 hover:text-neutral-600">
            ✕
          </button>
        </div>
      )}

      {/* Tempo control */}
      <div className="mb-4">
        <Label className="text-sm font-medium text-neutral-600 mb-2 block">
          Tempo: {tempo}x
        </Label>
        <div className="flex flex-wrap gap-1">
          {TEMPO_VALUES.map((t) => (
            <Button
              key={t}
              variant={tempo === t ? "default" : "outline"}
              size="sm"
              className="text-xs min-w-[3rem]"
              onClick={() => setTempo(t)}
            >
              {t}x
            </Button>
          ))}
        </div>
      </div>

      {/* Pitch control */}
      <div className="mb-6">
        <Label className="text-sm font-medium text-neutral-600 mb-2 block">
          Pitch: {pitch > 0 ? `+${pitch}` : pitch} semitones
        </Label>
        <div className="flex items-center gap-3">
          <Slider
            min={-6}
            max={6}
            step={1}
            value={[pitch]}
            onValueChange={(v) => setPitch(Array.isArray(v) ? v[0] : v)}
            className="flex-1"
          />
          <Button variant="outline" size="sm" onClick={() => setPitch(0)}>
            Reset
          </Button>
        </div>
      </div>

      {/* Sections */}
      <div className="border-t border-neutral-200 pt-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">Sections</h2>
          <Button variant="outline" size="sm" onClick={openNewSection}>
            + Add Section
          </Button>
        </div>

        {song.sections.length === 0 ? (
          <p className="text-sm text-neutral-400 py-4 text-center">
            No sections yet. Add one to start looping specific parts.
          </p>
        ) : (
          <ul className="space-y-1">
            {song.sections.map((section) => (
              <li
                key={section.id}
                className={`flex items-center gap-2 p-3 rounded-lg cursor-pointer transition-colors ${
                  loopSection?.id === section.id
                    ? "bg-blue-50 border border-blue-200"
                    : "bg-white border border-neutral-100 hover:bg-neutral-50"
                }`}
                onClick={() => selectSection(section)}
              >
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium truncate flex items-center gap-1.5">
                    {section.name}
                    {section.autoDetected && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0 font-normal text-neutral-400">
                        Auto
                      </Badge>
                    )}
                  </span>
                  <span className="text-xs text-neutral-500">
                    {formatTime(section.startSec)} – {formatTime(section.endSec)}
                  </span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openEditSection(section);
                  }}
                  className="text-neutral-400 hover:text-neutral-600 text-xs p-1"
                >
                  Edit
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteSection(section.id);
                  }}
                  className="text-neutral-400 hover:text-red-500 text-xs p-1"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Section editor dialog */}
      <Dialog open={sectionDialogOpen} onOpenChange={setSectionDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {editingSection ? "Edit Section" : "New Section"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label htmlFor="section-name">Name</Label>
              <Input
                id="section-name"
                value={sectionName}
                onChange={(e) => setSectionName(e.target.value)}
                placeholder="e.g., Verse 1, Chorus"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="section-start">Start (m:ss)</Label>
                <div className="flex gap-1">
                  <Input
                    id="section-start"
                    value={sectionStart}
                    onChange={(e) => setSectionStart(e.target.value)}
                    placeholder="0:00"
                  />
                  <Button variant="outline" size="sm" onClick={setStartToCurrent} title="Use current time">
                    Now
                  </Button>
                </div>
              </div>
              <div>
                <Label htmlFor="section-end">End (m:ss)</Label>
                <div className="flex gap-1">
                  <Input
                    id="section-end"
                    value={sectionEnd}
                    onChange={(e) => setSectionEnd(e.target.value)}
                    placeholder="0:30"
                  />
                  <Button variant="outline" size="sm" onClick={setEndToCurrent} title="Use current time">
                    Now
                  </Button>
                </div>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setSectionDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={saveSection}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
