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
import {
  ArrowLeft,
  Play,
  Pause,
  SkipBack,
  Repeat,
  Plus,
  X,
  Pencil,
  Trash2,
  Check,
  Loader2,
  StickyNote,
  ChevronDown,
  ChevronUp,
  Star,
  Clock,
  RotateCw,
  Disc3,
  Volume2,
  RefreshCw,
} from "lucide-react";
import { useMetronome } from "@/hooks/useMetronome";

interface Section {
  id: string;
  name: string;
  startSec: number;
  endSec: number;
  orderIndex: number;
  autoDetected: boolean;
  masteryRating: number | null;
}

interface Song {
  id: string;
  title: string;
  normalizedAudioPath: string | null;
  durationSec: number | null;
  processingStatus: string;
  bpm: number | null;
  beatTimestamps: string | null;
  notes: string;
  lastPositionSec: number;
  lastTempo: number | null;
  lastPitch: number | null;
  lastSelectedSections: string | null;
  artist: string;
  album: string;
  genre: string;
  year: string;
  sections: Section[];
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const TEMPO_VALUES = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2];

function PracticeSkeleton() {
  return (
    <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6">
      <div className="flex items-center gap-3 mb-6 animate-pulse">
        <div className="size-8 rounded-lg bg-muted" />
        <div className="h-6 bg-muted rounded w-1/2" />
      </div>
      <div className="h-4 bg-muted rounded w-full mb-6 animate-pulse" />
      <div className="flex justify-center mb-6 animate-pulse">
        <div className="size-16 rounded-full bg-muted" />
      </div>
      <div className="space-y-2 animate-pulse">
        <div className="h-8 bg-muted rounded w-1/3" />
        <div className="flex gap-1">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-8 bg-muted rounded w-12" />
          ))}
        </div>
      </div>
    </main>
  );
}

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
  const [selectedSectionIds, setSelectedSectionIds] = useState<string[]>([]);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settingsRestored, setSettingsRestored] = useState(false);

  // Title editing
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  // Notes
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const notesSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A-B loop (custom range, not section-based)
  const [abLoop, setAbLoop] = useState<{ a: number; b: number } | null>(null);
  const [settingAB, setSettingAB] = useState<"idle" | "a_set">("idle");
  const [abPointA, setAbPointA] = useState(0);

  // Section editor
  const [sectionDialogOpen, setSectionDialogOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<Section | null>(null);
  const [sectionName, setSectionName] = useState("");
  const [sectionStart, setSectionStart] = useState("");
  const [sectionEnd, setSectionEnd] = useState("");

  // Practice session tracking (M16)
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStartTime, setSessionStartTime] = useState<number>(Date.now());
  const [displayElapsed, setDisplayElapsed] = useState(0);

  // Metronome (M19)
  const [metronomeEnabled, setMetronomeEnabled] = useState(false);
  const [metronomeVolume, setMetronomeVolume] = useState(0.5);
  const [metronomeStandalone, setMetronomeStandalone] = useState(false);

  const [loopCounts, setLoopCounts] = useState<Record<string, number>>({});
  const [sectionTimes, setSectionTimes] = useState<Record<string, number>>({});
  const lastSectionRef = useRef<string | null>(null);
  const sectionEnteredAtRef = useRef<number>(Date.now());
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const webAudioConnectedRef = useRef(false);

  // Bookmark: save position periodically
  const lastSaveRef = useRef(0);
  const settingsSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSong = useCallback(async () => {
    try {
      const res = await fetch(`/api/songs/${id}`);
      if (!res.ok) throw new Error("Song not found");
      const data = await res.json();
      setSong(data);
      setNotesDraft(data.notes || "");
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load song");
    }
  }, [id]);

  useEffect(() => {
    fetchSong();
  }, [fetchSong]);

  // Restore last practice settings when song loads
  useEffect(() => {
    if (!song || settingsRestored) return;
    if (song.lastTempo !== null) setTempo(song.lastTempo);
    if (song.lastPitch !== null) setPitch(song.lastPitch);
    if (song.lastSelectedSections) {
      try {
        const ids = JSON.parse(song.lastSelectedSections) as string[];
        if (ids.length > 0) {
          const validIds = ids.filter(sid => song.sections.some(s => s.id === sid));
          if (validIds.length > 0) {
            setSelectedSectionIds(validIds);
            setLoopEnabled(true);
          }
        }
      } catch { /* ignore invalid JSON */ }
    }
    setSettingsRestored(true);
  }, [song, settingsRestored]);

  // Save practice settings on change (debounced)
  const savePracticeSettings = useCallback((t: number, p: number, sIds: string[]) => {
    if (settingsSaveTimerRef.current) clearTimeout(settingsSaveTimerRef.current);
    settingsSaveTimerRef.current = setTimeout(() => {
      fetch(`/api/songs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lastTempo: t,
          lastPitch: p,
          lastSelectedSections: JSON.stringify(sIds),
        }),
      }).catch(() => {});
    }, 1000);
  }, [id]);

  useEffect(() => {
    if (!settingsRestored) return;
    savePracticeSettings(tempo, pitch, selectedSectionIds);
  }, [tempo, pitch, selectedSectionIds, settingsRestored, savePracticeSettings]);

  // Start practice session on mount, end on unmount
  useEffect(() => {
    if (!song || song.processingStatus !== "ready") return;
    const startTime = Date.now();
    setSessionStartTime(startTime);

    fetch("/api/practice-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ songId: id, tempo, pitch }),
    })
      .then(res => res.json())
      .then(data => setSessionId(data.id))
      .catch(() => {});

    return () => {
      const durationSec = (Date.now() - startTime) / 1000;
      // Use sendBeacon for reliable delivery on page unload
      const endData = JSON.stringify({
        endedAt: new Date().toISOString(),
        durationSec,
      });
      // sessionId might not be set yet, so we use a closure trick
      // The actual flush happens via the flushTimerRef cleanup
      navigator.sendBeacon?.(`/api/practice-sessions/${sessionId}`, new Blob([endData], { type: "application/json" }));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song?.processingStatus]);

  // Flush section practice logs periodically (every 30s)
  useEffect(() => {
    if (!sessionId) return;

    const flush = () => {
      const counts = loopCounts;
      const times = sectionTimes;
      for (const sectionId of Object.keys(counts)) {
        if (counts[sectionId] > 0 || (times[sectionId] ?? 0) > 0) {
          fetch(`/api/practice-sessions/${sessionId}/logs`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sectionId,
              loopCount: counts[sectionId] ?? 0,
              durationSec: times[sectionId] ?? 0,
            }),
          }).catch(() => {});
        }
      }
    };

    flushTimerRef.current = setInterval(flush, 30000);
    return () => {
      if (flushTimerRef.current) clearInterval(flushTimerRef.current);
      flush(); // Final flush on cleanup
    };
  }, [sessionId, loopCounts, sectionTimes]);

  // Track which section is currently playing and accumulate time
  useEffect(() => {
    if (!playing || !song) return;
    const interval = setInterval(() => {
      const cs = song.sections.find(
        s => currentTime >= s.startSec && currentTime < s.endSec
      );
      if (cs) {
        if (lastSectionRef.current !== cs.id) {
          // Section changed — if we had a previous section and loop is active, count a loop
          if (lastSectionRef.current && loopEnabled && selectedSectionIds.includes(lastSectionRef.current)) {
            setLoopCounts(prev => ({
              ...prev,
              [lastSectionRef.current!]: (prev[lastSectionRef.current!] ?? 0) + 1,
            }));
          }
          lastSectionRef.current = cs.id;
          sectionEnteredAtRef.current = Date.now();
        }
        // Accumulate time in current section
        setSectionTimes(prev => ({
          ...prev,
          [cs.id]: (prev[cs.id] ?? 0) + 1,
        }));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [playing, song, currentTime, loopEnabled, selectedSectionIds]);

  // Session elapsed timer
  useEffect(() => {
    const timer = setInterval(() => {
      setDisplayElapsed(Math.floor((Date.now() - sessionStartTime) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [sessionStartTime]);

  // Metronome
  const parsedBeats: number[] = (() => {
    if (!song?.beatTimestamps) return [];
    try { return JSON.parse(song.beatTimestamps); } catch { return []; }
  })();

  const { isActive: metronomeActive, currentBeat, tapSync, doCountIn, handleTapTempo, manualBpm, resetManualBpm } = useMetronome({
    bpm: (song?.bpm ?? 0) * tempo,
    enabled: metronomeEnabled,
    volume: metronomeVolume,
    playing,
    audioRef,
    beatTimestamps: parsedBeats,
    tempo,
    standalone: metronomeStandalone,
  });

  const baseBpm = manualBpm ?? song?.bpm ?? 0;
  const effectiveBpm = baseBpm * tempo;

  // Count-in then play
  async function handleCountInPlay() {
    if (!audioRef.current || playing) return;
    setMetronomeEnabled(true);
    await doCountIn();
    audioRef.current.play();
    setPlaying(true);
  }

  // Re-analyze
  const [reanalyzing, setReanalyzing] = useState(false);
  async function handleReanalyze() {
    if (reanalyzing) return;
    setReanalyzing(true);
    try {
      await fetch(`/api/songs/${id}/reanalyze`, { method: "POST" });
      // Poll until processing is done
      const poll = setInterval(async () => {
        const res = await fetch(`/api/songs/${id}`);
        const data = await res.json();
        if (data.processingStatus === "ready") {
          clearInterval(poll);
          setSong(data);
          setNotesDraft(data.notes || "");
          setReanalyzing(false);
        }
      }, 2000);
    } catch {
      setReanalyzing(false);
    }
  }

  // Set up audio element
  useEffect(() => {
    if (!song?.normalizedAudioPath) return;

    const audio = new Audio(`/api/media/${song.normalizedAudioPath}`);
    audio.preload = "auto";
    audioRef.current = audio;

    audio.addEventListener("loadedmetadata", () => {
      setDuration(audio.duration);
      // Restore last position
      if (song.lastPositionSec > 0 && song.lastPositionSec < audio.duration) {
        audio.currentTime = song.lastPositionSec;
        setCurrentTime(song.lastPositionSec);
      }
    });

    audio.addEventListener("timeupdate", () => {
      setCurrentTime(audio.currentTime);
    });

    audio.addEventListener("ended", () => {
      setPlaying(false);
    });

    return () => {
      // Save position on unmount
      if (audio.currentTime > 0) {
        fetch(`/api/songs/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lastPositionSec: audio.currentTime }),
        }).catch(() => {});
      }
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, [song?.normalizedAudioPath, song?.lastPositionSec, id]);

  // Save bookmark every 10 seconds while playing
  useEffect(() => {
    if (!playing) return;
    const interval = setInterval(() => {
      const audio = audioRef.current;
      if (audio && Math.abs(audio.currentTime - lastSaveRef.current) > 5) {
        lastSaveRef.current = audio.currentTime;
        fetch(`/api/songs/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lastPositionSec: audio.currentTime }),
        }).catch(() => {});
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [playing, id]);

  // Compute loop range from selected sections
  const loopRange = (() => {
    if (selectedSectionIds.length === 0 || !song) return null;
    const selected = song.sections.filter((s) => selectedSectionIds.includes(s.id));
    if (selected.length === 0) return null;
    const startSec = Math.min(...selected.map((s) => s.startSec));
    const endSec = Math.max(...selected.map((s) => s.endSec));
    const names = selected.sort((a, b) => a.orderIndex - b.orderIndex).map((s) => s.name);
    return { startSec, endSec, names };
  })();

  // Handle section looping
  useEffect(() => {
    if (!audioRef.current || !loopEnabled || !loopRange) return;

    const audio = audioRef.current;
    const { startSec, endSec } = loopRange;
    const handleTimeUpdate = () => {
      if (audio.currentTime >= endSec) {
        audio.currentTime = startSec;
      }
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    return () => audio.removeEventListener("timeupdate", handleTimeUpdate);
  }, [loopEnabled, loopRange]);

  // Handle A-B looping
  useEffect(() => {
    if (!audioRef.current || !abLoop) return;

    const audio = audioRef.current;
    const { a, b } = abLoop;
    const handleTimeUpdate = () => {
      if (audio.currentTime >= b) {
        audio.currentTime = a;
      }
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    return () => audio.removeEventListener("timeupdate", handleTimeUpdate);
  }, [abLoop]);

  // Handle tempo changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = tempo;
    }
  }, [tempo]);

  // Handle pitch changes
  useEffect(() => {
    if (!audioRef.current || pitch === 0) {
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

    const audio = audioRef.current;
    audio.preservesPitch = false;
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
    if (abLoop) {
      audio.currentTime = abLoop.a;
    } else if (loopEnabled && loopRange) {
      audio.currentTime = loopRange.startSec;
    } else {
      audio.currentTime = 0;
    }
    setCurrentTime(audio.currentTime);
  }

  function selectSection(section: Section, extend: boolean) {
    // Clear A-B loop when selecting sections
    if (abLoop) {
      setAbLoop(null);
      setSettingAB("idle");
    }

    if (extend && selectedSectionIds.length > 0 && song) {
      // Shift+click: range selection (desktop)
      const allIds = song.sections.map((s) => s.id);
      const firstSelectedIdx = allIds.indexOf(selectedSectionIds[0]);
      const clickedIdx = allIds.indexOf(section.id);
      const start = Math.min(firstSelectedIdx, clickedIdx);
      const end = Math.max(firstSelectedIdx, clickedIdx);
      const rangeIds = allIds.slice(start, end + 1);
      setSelectedSectionIds(rangeIds);
    } else if (selectedSectionIds.includes(section.id)) {
      // Tap-to-toggle: deselect if already selected
      const remaining = selectedSectionIds.filter(sid => sid !== section.id);
      if (remaining.length === 0) {
        clearLoop();
        return;
      }
      setSelectedSectionIds(remaining);
    } else if (selectedSectionIds.length > 0) {
      // Tap-to-toggle: add to selection (touch-friendly multi-select)
      setSelectedSectionIds([...selectedSectionIds, section.id]);
    } else {
      // First selection
      setSelectedSectionIds([section.id]);
    }
    setLoopEnabled(true);
    if (audioRef.current) {
      audioRef.current.currentTime = section.startSec;
      setCurrentTime(section.startSec);
    }
  }

  function clearLoop() {
    setSelectedSectionIds([]);
    setLoopEnabled(false);
  }

  function handleABLoop() {
    if (settingAB === "idle") {
      // Set point A
      setAbPointA(currentTime);
      setSettingAB("a_set");
      // Clear section loop
      clearLoop();
    } else if (settingAB === "a_set") {
      // Set point B
      const a = Math.min(abPointA, currentTime);
      const b = Math.max(abPointA, currentTime);
      if (b - a > 0.5) {
        setAbLoop({ a, b });
      }
      setSettingAB("idle");
    }
  }

  function clearABLoop() {
    setAbLoop(null);
    setSettingAB("idle");
  }

  // Title editing
  async function saveTitle() {
    if (!titleDraft.trim() || titleDraft === song?.title) {
      setEditingTitle(false);
      return;
    }
    await fetch(`/api/songs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: titleDraft }),
    });
    setEditingTitle(false);
    await fetchSong();
  }

  // Notes auto-save
  function handleNotesChange(value: string) {
    setNotesDraft(value);
    if (notesSaveTimerRef.current) clearTimeout(notesSaveTimerRef.current);
    notesSaveTimerRef.current = setTimeout(() => {
      fetch(`/api/songs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: value }),
      }).catch(() => {});
    }, 1000);
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
    if (selectedSectionIds.includes(sectionId)) {
      const remaining = selectedSectionIds.filter((id) => id !== sectionId);
      setSelectedSectionIds(remaining);
      if (remaining.length === 0) setLoopEnabled(false);
    }
    await fetchSong();
  }

  function setStartToCurrent() {
    setSectionStart(formatTime(currentTime));
  }

  function setEndToCurrent() {
    setSectionEnd(formatTime(currentTime));
  }

  // Mastery rating
  async function setMasteryRating(sectionId: string, rating: number) {
    const currentRating = song?.sections.find(s => s.id === sectionId)?.masteryRating;
    const newRating = currentRating === rating ? null : rating; // Toggle off if same
    await fetch(`/api/sections/${sectionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ masteryRating: newRating }),
    });
    await fetchSong();
  }

  // Format practice time
  function formatPracticeTime(sec: number): string {
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }

  if (!song && !loadError) {
    return <PracticeSkeleton />;
  }

  if (loadError) {
    return (
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="size-4" />
          Library
        </Link>
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center size-14 rounded-full bg-destructive/10 mb-4">
            <X className="size-6 text-destructive" />
          </div>
          <p className="text-base font-medium text-foreground mb-1">Failed to load song</p>
          <p className="text-sm text-muted-foreground mb-4">{loadError}</p>
          <Button variant="outline" onClick={() => { setLoadError(null); fetchSong(); }}>
            Try again
          </Button>
        </div>
      </main>
    );
  }

  if (!song) return null;

  if (song.processingStatus !== "ready") {
    return (
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="size-4" />
          Library
        </Link>
        <h1 className="text-xl font-semibold mb-4 text-foreground">{song.title}</h1>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          <span>Song is {song.processingStatus}...</span>
        </div>
      </main>
    );
  }

  // Section colors helper
  const sectionColors = [
    "bg-violet-400/40 dark:bg-violet-600/30",
    "bg-sky-400/40 dark:bg-sky-600/30",
    "bg-emerald-400/40 dark:bg-emerald-600/30",
    "bg-amber-400/40 dark:bg-amber-600/30",
    "bg-rose-400/40 dark:bg-rose-600/30",
    "bg-cyan-400/40 dark:bg-cyan-600/30",
    "bg-fuchsia-400/40 dark:bg-fuchsia-600/30",
    "bg-lime-400/40 dark:bg-lime-600/30",
    "bg-orange-400/40 dark:bg-orange-600/30",
    "bg-teal-400/40 dark:bg-teal-600/30",
  ];
  const labelColors = [
    "text-violet-800 dark:text-violet-200",
    "text-sky-800 dark:text-sky-200",
    "text-emerald-800 dark:text-emerald-200",
    "text-amber-800 dark:text-amber-200",
    "text-rose-800 dark:text-rose-200",
    "text-cyan-800 dark:text-cyan-200",
    "text-fuchsia-800 dark:text-fuchsia-200",
    "text-lime-800 dark:text-lime-200",
    "text-orange-800 dark:text-orange-200",
    "text-teal-800 dark:text-teal-200",
  ];
  const sectionDotColors = [
    "bg-violet-400", "bg-sky-400", "bg-emerald-400", "bg-amber-400", "bg-rose-400",
    "bg-cyan-400", "bg-fuchsia-400", "bg-lime-400", "bg-orange-400", "bg-teal-400",
  ];

  const currentSection = song.sections.find(
    (s) => currentTime >= s.startSec && currentTime < s.endSec
  );

  const metaParts: string[] = [];
  if (song.artist) metaParts.push(song.artist);
  if (song.album) metaParts.push(song.album);
  if (song.year) metaParts.push(song.year);

  return (
    <main className="flex-1 w-full px-4 lg:px-8 py-4 max-w-7xl mx-auto">
      {/* ===== TOP: Header + Player (full width) ===== */}
      <div className="mb-4">
        {/* Header row: back + title + metadata */}
        <div className="flex items-start gap-3 mb-4">
          <Link
            href="/"
            className="p-2 -ml-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted active:scale-90 transition-all mt-0.5 shrink-0"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div className="flex-1 min-w-0">
            {editingTitle ? (
              <div className="flex items-center gap-2">
                <Input
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveTitle();
                    if (e.key === "Escape") setEditingTitle(false);
                  }}
                  className="text-lg font-semibold h-9"
                  autoFocus
                />
                <Button size="icon-sm" onClick={saveTitle}>
                  <Check className="size-4" />
                </Button>
                <Button size="icon-sm" variant="outline" onClick={() => setEditingTitle(false)}>
                  <X className="size-4" />
                </Button>
              </div>
            ) : (
              <h1
                className="text-xl font-semibold truncate text-foreground cursor-pointer hover:text-foreground/80 transition-colors group"
                onClick={() => { setTitleDraft(song.title); setEditingTitle(true); }}
              >
                {song.title}
                <Pencil className="inline-block size-3.5 ml-2 opacity-0 group-hover:opacity-40 transition-opacity" />
              </h1>
            )}
            {/* Metadata pills row */}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {metaParts.length > 0 && (
                <span className="text-[13px] text-muted-foreground">
                  {metaParts.join(" · ")}
                </span>
              )}
              {song.genre && (
                <span className="text-[11px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{song.genre}</span>
              )}
              {song.bpm && (
                <span className="text-[11px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{Math.round(song.bpm)} BPM</span>
              )}
              {song.durationSec && (
                <span className="text-[11px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{formatTime(song.durationSec)}</span>
              )}
              <button
                onClick={handleReanalyze}
                disabled={reanalyzing}
                className="text-[11px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full hover:bg-accent transition-colors flex items-center gap-1"
                title="Re-analyze sections and BPM"
              >
                <RefreshCw className={`size-3 ${reanalyzing ? "animate-spin" : ""}`} />
                {reanalyzing ? "Analyzing..." : "Re-analyze"}
              </button>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        {duration > 0 && song.sections.length > 0 ? (
          <div className="mb-3">
            <div className="relative h-11 rounded-xl overflow-hidden bg-muted">
              {song.sections.map((section, idx) => {
                const leftPct = (section.startSec / duration) * 100;
                const widthPct = ((section.endSec - section.startSec) / duration) * 100;
                const isSelected = selectedSectionIds.includes(section.id);
                const isPlaying = currentTime >= section.startSec && currentTime < section.endSec;
                const selectedColor = "bg-blue-400/60 dark:bg-blue-500/50";
                const playingColor = isSelected
                  ? "bg-blue-400/80 dark:bg-blue-500/70"
                  : sectionColors[idx % sectionColors.length].replace("/40", "/60").replace("/30", "/50");
                const abHighlight = abLoop && section.startSec < abLoop.b && section.endSec > abLoop.a;

                return (
                  <div
                    key={section.id}
                    className={`absolute inset-y-0 flex items-end transition-colors ${
                      isSelected
                        ? isPlaying ? "bg-blue-400/80 dark:bg-blue-500/70" : selectedColor
                        : abHighlight
                        ? "bg-orange-300/70 dark:bg-orange-700/50"
                        : isPlaying
                        ? playingColor
                        : sectionColors[idx % sectionColors.length]
                    }`}
                    style={{
                      left: `${leftPct}%`,
                      width: `${widthPct}%`,
                      borderRight: idx < song.sections.length - 1 ? "1px solid rgba(255,255,255,0.2)" : "none",
                    }}
                  >
                    <span
                      className={`text-[10px] leading-none px-1.5 pb-1.5 truncate w-full ${
                        isPlaying || isSelected
                          ? "text-foreground font-semibold"
                          : labelColors[idx % labelColors.length] + " font-medium"
                      }`}
                    >
                      {widthPct > 4 ? section.name : ""}
                    </span>
                  </div>
                );
              })}
              <div
                className="absolute inset-y-0 left-0 bg-primary/12 dark:bg-primary/8 pointer-events-none"
                style={{ width: `${(currentTime / duration) * 100}%` }}
              />
              <div
                className="absolute inset-y-0 w-0.5 bg-white dark:bg-white shadow-sm pointer-events-none z-10"
                style={{ left: `${(currentTime / duration) * 100}%` }}
              />
              <input
                type="range"
                min={0}
                max={duration}
                step={0.1}
                value={currentTime}
                onChange={(e) => seek(parseFloat(e.target.value))}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
              />
            </div>
            <div className="flex justify-between items-center text-xs text-muted-foreground mt-1.5 px-0.5">
              <span className="tabular-nums">{formatTime(currentTime)}</span>
              {currentSection && (
                <span className="text-foreground/80 font-medium">{currentSection.name}</span>
              )}
              <span className="tabular-nums">{formatTime(duration)}</span>
            </div>
          </div>
        ) : (
          <div className="mb-3">
            <div className="relative">
              {abLoop && duration > 0 && (
                <div
                  className="absolute z-0 pointer-events-none rounded-sm bg-orange-200 dark:bg-orange-800"
                  style={{
                    left: `${(abLoop.a / duration) * 100}%`,
                    width: `${((abLoop.b - abLoop.a) / duration) * 100}%`,
                    top: "6px",
                    height: "4px",
                  }}
                />
              )}
              <Slider
                min={0}
                max={duration || 100}
                step={0.1}
                value={[currentTime]}
                onValueChange={seek}
                className="w-full"
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span className="tabular-nums">{formatTime(currentTime)}</span>
              <span className="tabular-nums">{formatTime(duration)}</span>
            </div>
          </div>
        )}

        {/* Playback controls */}
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={jumpToStart}
            className="size-11 active:scale-90 transition-transform"
          >
            <SkipBack className="size-5" />
          </Button>
          <button
            className="size-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center active:scale-95 transition-transform shadow-sm"
            onClick={togglePlay}
          >
            {playing ? <Pause className="size-7" /> : <Play className="size-7 ml-0.5" />}
          </button>
          <Button
            variant={settingAB === "a_set" ? "default" : abLoop ? "secondary" : "outline"}
            size="icon"
            onClick={abLoop ? clearABLoop : handleABLoop}
            className="size-11 active:scale-90 transition-transform text-xs font-bold"
            title={settingAB === "a_set" ? "Set point B" : abLoop ? "Clear A-B loop" : "Set A-B loop"}
          >
            {settingAB === "a_set" ? "B?" : "AB"}
          </Button>
        </div>

        {/* Loop / A-B indicators */}
        <div className="mt-3 space-y-2">
          {loopEnabled && loopRange && (
            <div className="flex items-center justify-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-950 rounded-lg">
              <Repeat className="size-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
              <span className="text-sm text-blue-700 dark:text-blue-300 font-medium">
                {loopRange.names.join(" + ")} ({formatTime(loopRange.startSec)} – {formatTime(loopRange.endSec)})
              </span>
              <button onClick={clearLoop} className="p-1 rounded text-blue-400 hover:text-blue-600 active:scale-90 transition-all">
                <X className="size-3.5" />
              </button>
            </div>
          )}
          {abLoop && (
            <div className="flex items-center justify-center gap-2 px-3 py-2 bg-orange-50 dark:bg-orange-950 rounded-lg">
              <Repeat className="size-3.5 text-orange-600 dark:text-orange-400 shrink-0" />
              <span className="text-sm text-orange-700 dark:text-orange-300 font-medium">
                A-B Loop: {formatTime(abLoop.a)} – {formatTime(abLoop.b)}
              </span>
              <button onClick={clearABLoop} className="p-1 rounded text-orange-400 hover:text-orange-600 active:scale-90 transition-all">
                <X className="size-3.5" />
              </button>
            </div>
          )}
          {settingAB === "a_set" && !abLoop && (
            <div className="flex items-center justify-center gap-2 px-3 py-2 bg-orange-50 dark:bg-orange-950 rounded-lg">
              <span className="text-sm text-orange-700 dark:text-orange-300">
                Point A set at {formatTime(abPointA)} — navigate to B and press AB
              </span>
              <button onClick={() => setSettingAB("idle")} className="p-1 rounded text-orange-400 hover:text-orange-600">
                <X className="size-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ===== BOTTOM: Two-column layout on wide screens ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column: Controls + Notes */}
        <div className="space-y-5">
          {/* Tempo control */}
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Label className="text-sm font-semibold text-foreground">
                Tempo: {tempo}x
              </Label>
              {song.bpm && (
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {Math.round(song.bpm * tempo)} BPM{tempo !== 1 && ` (was ${Math.round(song.bpm)})`}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {TEMPO_VALUES.map((t) => (
                <Button
                  key={t}
                  variant={tempo === t ? "default" : "outline"}
                  size="sm"
                  className="text-xs min-w-[3.2rem] h-10 active:scale-95 transition-transform"
                  onClick={() => setTempo(t)}
                >
                  {t}x
                </Button>
              ))}
            </div>
          </div>

          {/* Pitch control */}
          <div className="bg-card border border-border rounded-xl p-4">
            <Label className="text-sm font-semibold text-foreground mb-3 block">
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
              <Button variant="outline" size="sm" onClick={() => setPitch(0)} className="h-10">
                Reset
              </Button>
            </div>
          </div>

          {/* Metronome */}
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Disc3 className={`size-4 ${metronomeActive ? "animate-spin text-primary" : "text-muted-foreground"}`} />
                <Label className="text-sm font-semibold text-foreground">
                  Metronome
                </Label>
                {metronomeEnabled && baseBpm > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {Math.round(effectiveBpm)} BPM
                    {manualBpm && <span className="text-[10px] ml-1">(tap)</span>}
                  </span>
                )}
              </div>
              <button
                onClick={() => setMetronomeEnabled(!metronomeEnabled)}
                className={`relative w-11 h-6 rounded-full transition-colors ${metronomeEnabled ? "bg-primary" : "bg-muted"}`}
              >
                <div
                  className={`absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform ${metronomeEnabled ? "translate-x-5.5" : "translate-x-0.5"}`}
                />
              </button>
            </div>
            {metronomeEnabled && (
              <div className="space-y-3">
                {/* Beat indicator */}
                <div className="flex items-center justify-center gap-2">
                  {[0, 1, 2, 3].map(i => (
                    <div
                      key={i}
                      className={`size-3 rounded-full transition-all ${
                        metronomeActive && currentBeat === i
                          ? i === 0 ? "bg-primary scale-125" : "bg-primary/70 scale-110"
                          : "bg-muted"
                      }`}
                    />
                  ))}
                </div>

                {/* Volume */}
                <div className="flex items-center gap-3">
                  <Volume2 className="size-4 text-muted-foreground shrink-0" />
                  <Slider
                    min={0}
                    max={1}
                    step={0.05}
                    value={[metronomeVolume]}
                    onValueChange={(v) => setMetronomeVolume(Array.isArray(v) ? v[0] : v)}
                    className="flex-1"
                  />
                </div>

                {/* Controls row */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* Tap tempo */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-8 gap-1"
                    onClick={handleTapTempo}
                  >
                    Tap BPM
                  </Button>

                  {/* Tap sync */}
                  {parsedBeats.length === 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-8 gap-1"
                      onClick={tapSync}
                    >
                      Sync
                    </Button>
                  )}

                  {/* Count-in play */}
                  {!playing && baseBpm > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-8 gap-1"
                      onClick={handleCountInPlay}
                    >
                      <Play className="size-3" />
                      Count-in
                    </Button>
                  )}

                  {/* Standalone toggle */}
                  <Button
                    variant={metronomeStandalone ? "secondary" : "outline"}
                    size="sm"
                    className="text-xs h-8"
                    onClick={() => setMetronomeStandalone(!metronomeStandalone)}
                  >
                    Solo
                  </Button>

                  {/* Reset manual BPM */}
                  {manualBpm && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-8"
                      onClick={resetManualBpm}
                    >
                      Reset BPM
                    </Button>
                  )}
                </div>

                {parsedBeats.length > 0 && (
                  <p className="text-[10px] text-muted-foreground/50">
                    Synced to {parsedBeats.length} detected beats
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="bg-card border border-border rounded-xl p-4">
            <button
              onClick={() => setNotesOpen(!notesOpen)}
              className="flex items-center gap-2 text-sm font-semibold text-foreground w-full"
            >
              <StickyNote className="size-4 text-muted-foreground" />
              Notes
              {notesDraft && !notesOpen && (
                <span className="text-xs text-muted-foreground font-normal truncate flex-1 text-left ml-1">
                  — {notesDraft.slice(0, 60)}
                </span>
              )}
              {notesOpen ? (
                <ChevronUp className="size-4 text-muted-foreground ml-auto" />
              ) : (
                <ChevronDown className="size-4 text-muted-foreground ml-auto" />
              )}
            </button>
            {notesOpen && (
              <textarea
                value={notesDraft}
                onChange={(e) => handleNotesChange(e.target.value)}
                placeholder="Add practice notes, chord progressions, reminders..."
                className="w-full mt-3 p-3 text-sm border border-border rounded-lg bg-background resize-y min-h-[100px] focus:outline-none focus:ring-2 focus:ring-ring/30 text-foreground placeholder:text-muted-foreground"
              />
            )}
          </div>
        </div>

        {/* Right column: Sections */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">Sections</h2>
              {displayElapsed > 0 && (
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Clock className="size-3" />
                  {formatPracticeTime(displayElapsed)}
                </span>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={openNewSection} className="gap-1 h-9">
              <Plus className="size-3.5" />
              Add
            </Button>
          </div>

          {song.sections.length === 0 ? (
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center size-12 rounded-full bg-muted mb-3">
                <Plus className="size-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                No sections yet. Add one to start looping.
              </p>
            </div>
          ) : (
            <ul className="space-y-1.5 max-h-[50vh] overflow-y-auto lg:max-h-[calc(100vh-420px)]">
              {song.sections.map((section, idx) => {
                const isSelected = selectedSectionIds.includes(section.id);
                const isPlaying = currentTime >= section.startSec && currentTime < section.endSec;
                return (
                  <li
                    key={section.id}
                    className={`flex items-center gap-2.5 p-3 rounded-xl cursor-pointer transition-all active:scale-[0.99] ${
                      isSelected
                        ? "bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800"
                        : isPlaying
                        ? "bg-muted/80 border border-border"
                        : "border border-transparent hover:bg-muted/50"
                    }`}
                    onClick={(e) => selectSection(section, e.shiftKey)}
                  >
                    {/* Color dot */}
                    <div className={`size-2.5 rounded-full shrink-0 ${sectionDotColors[idx % sectionDotColors.length]}`} />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium truncate flex items-center gap-1.5 text-foreground">
                        {section.name}
                        {section.autoDetected && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 font-normal text-muted-foreground">
                            Auto
                          </Badge>
                        )}
                        {(loopCounts[section.id] ?? 0) > 0 && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <RotateCw className="size-2.5" />
                            {loopCounts[section.id]}
                          </span>
                        )}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {formatTime(section.startSec)} – {formatTime(section.endSec)}
                        </span>
                        {/* Mastery stars */}
                        <span className="flex items-center gap-px" onClick={(e) => e.stopPropagation()}>
                          {[1, 2, 3, 4, 5].map(star => (
                            <button
                              key={star}
                              onClick={(e) => { e.stopPropagation(); setMasteryRating(section.id, star); }}
                              className="p-0 active:scale-90 transition-transform"
                            >
                              <Star
                                className={`size-3 ${
                                  section.masteryRating && star <= section.masteryRating
                                    ? "text-yellow-400 fill-yellow-400"
                                    : "text-muted-foreground/30"
                                }`}
                              />
                            </button>
                          ))}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); openEditSection(section); }}
                      className="p-2 rounded-lg text-muted-foreground/40 hover:text-foreground hover:bg-muted active:scale-90 transition-all"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteSection(section.id); }}
                      className="p-2 rounded-lg text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 active:scale-90 transition-all"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="text-[11px] text-muted-foreground/50 mt-3 px-1">
            Tap to select · Tap again to add/remove
          </p>
        </div>
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
                className="h-10"
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
                    className="h-10"
                  />
                  <Button variant="outline" size="sm" onClick={setStartToCurrent} title="Use current time" className="h-10">
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
                    className="h-10"
                  />
                  <Button variant="outline" size="sm" onClick={setEndToCurrent} title="Use current time" className="h-10">
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
