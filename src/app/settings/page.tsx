"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ArrowLeft, RotateCcw, Save, Loader2, Moon, Sun } from "lucide-react";

const DEFAULT_PROMPT = `You are an expert music analyst. I've extracted audio features from a song and generated these visualizations:

1. **Chromagram**: Shows pitch content over time. Similar color patterns = similar harmonic content (likely same section). Look for repeating blocks of color.
2. **Energy (RMS)**: Shows loudness. Drops often indicate transitions (e.g., verse→bridge). Peaks often indicate choruses.
3. **Spectral Contrast**: Shows timbral changes. Shifts indicate different instrumentation or arrangement.
4. **Novelty Curve**: Computed structural novelty. Peaks = likely section boundaries. Green dashed lines are algorithmically detected candidates.

Song metadata:
- Duration: {duration_sec} seconds
- Estimated BPM: {estimated_bpm}
- Total beats: {beat_count}
- Algorithm-detected candidate boundaries: {candidates}

Please analyze the image carefully:

**Step 1**: Describe what you observe in each panel. Where do you see repeating patterns in the chromagram? Where are the energy changes? What do the spectral contrast shifts tell you?

**Step 2**: Based on your observations, identify the musical sections. Use the candidate boundaries as hints but trust your visual analysis — you may merge, split, or ignore candidates.

**Step 3**: Output your final answer as ONLY a JSON array (no other text after it). Each section must have:
- "name": a musically meaningful label (Intro, Verse 1, Pre-Chorus, Chorus 1, Post-Chorus, Bridge, Solo, Verse 2, Chorus 2, Outro, etc.)
- "startSec": start time in seconds (number)
- "endSec": end time in seconds (number)

Rules:
- Sections must cover the entire song from 0 to {duration_sec}
- No gaps or overlaps
- Minimum section length is 5 seconds
- If you see repeating patterns, number them (Verse 1, Verse 2, Chorus 1, Chorus 2)
- Align boundaries to musically sensible points (beat boundaries, energy transitions)

Begin your analysis:`;

export default function SettingsPage() {
  const [prompt, setPrompt] = useState("");
  const [youtubeMaxDuration, setYoutubeMaxDuration] = useState(10); // minutes
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    // Check current dark mode state
    setDarkMode(document.documentElement.classList.contains("dark"));

    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        setPrompt(data.analysisPrompt || "");
        setYoutubeMaxDuration(Math.floor((data.youtubeMaxDuration || 600) / 60));
        setLoading(false);
      });
  }, []);

  function toggleDarkMode() {
    const newValue = !darkMode;
    setDarkMode(newValue);
    document.documentElement.classList.toggle("dark", newValue);
    localStorage.setItem("theme", newValue ? "dark" : "light");
  }

  async function handleSave() {
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        analysisPrompt: prompt,
        youtubeMaxDuration: youtubeMaxDuration * 60,
      }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleReset() {
    setPrompt("");
  }

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  return (
    <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/"
          className="p-2 -ml-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted active:scale-90 transition-all"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
      </div>

      <div className="space-y-6">
        {/* Dark mode toggle */}
        <div className="flex items-center justify-between p-4 bg-card rounded-xl border border-border">
          <div className="flex items-center gap-3">
            {darkMode ? <Moon className="size-5 text-muted-foreground" /> : <Sun className="size-5 text-muted-foreground" />}
            <div>
              <p className="text-sm font-medium text-foreground">Dark Mode</p>
              <p className="text-xs text-muted-foreground">Switch between light and dark themes</p>
            </div>
          </div>
          <button
            onClick={toggleDarkMode}
            className={`relative w-11 h-6 rounded-full transition-colors ${darkMode ? "bg-primary" : "bg-muted"}`}
          >
            <div
              className={`absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform ${darkMode ? "translate-x-5.5" : "translate-x-0.5"}`}
            />
          </button>
        </div>

        {/* YouTube import settings */}
        <div className="p-4 bg-card rounded-xl border border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">YouTube Max Duration</p>
              <p className="text-xs text-muted-foreground">Maximum video length for YouTube imports</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={60}
                value={youtubeMaxDuration}
                onChange={(e) => setYoutubeMaxDuration(parseInt(e.target.value) || 10)}
                className="w-16 h-9 px-2 text-sm text-center border border-border rounded-lg bg-background text-foreground"
              />
              <span className="text-sm text-muted-foreground">min</span>
            </div>
          </div>
        </div>

        {/* Analysis prompt */}
        <div>
          <Label className="text-sm font-medium mb-2 block text-foreground">
            Analysis Prompt
          </Label>
          <p className="text-xs text-muted-foreground mb-3">
            Customize the prompt sent to Claude when analyzing song sections.
            Use these placeholders: <code className="bg-muted px-1 rounded text-foreground">{"{duration_sec}"}</code>,{" "}
            <code className="bg-muted px-1 rounded text-foreground">{"{estimated_bpm}"}</code>,{" "}
            <code className="bg-muted px-1 rounded text-foreground">{"{beat_count}"}</code>,{" "}
            <code className="bg-muted px-1 rounded text-foreground">{"{candidates}"}</code>.
          </p>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={DEFAULT_PROMPT}
            className="w-full h-96 p-3 text-sm font-mono border border-border rounded-lg bg-card resize-y focus:outline-none focus:ring-2 focus:ring-ring/30 text-foreground placeholder:text-muted-foreground"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Leave empty to use the default prompt.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={handleSave} className="gap-1.5">
            {saved ? (
              <>Saved!</>
            ) : (
              <>
                <Save className="size-4" />
                Save
              </>
            )}
          </Button>
          <Button variant="outline" onClick={handleReset} className="gap-1.5">
            <RotateCcw className="size-4" />
            Reset to Default
          </Button>
        </div>
      </div>
    </main>
  );
}
