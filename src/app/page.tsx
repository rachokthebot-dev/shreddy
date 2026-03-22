"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Song {
  id: string;
  title: string;
  originalFilename: string;
  durationSec: number | null;
  processingStatus: string;
  createdAt: string;
}

function formatDuration(sec: number | null): string {
  if (!sec) return "";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function statusBadge(status: string) {
  switch (status) {
    case "ready":
      return <Badge variant="default" className="bg-green-600 text-white">Ready</Badge>;
    case "processing":
      return <Badge variant="secondary">Processing...</Badge>;
    case "pending":
      return <Badge variant="secondary">Pending</Badge>;
    case "error":
      return <Badge variant="destructive">Error</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function LibraryPage() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [uploading, setUploading] = useState(false);

  const fetchSongs = useCallback(async () => {
    const res = await fetch("/api/songs");
    const data = await res.json();
    setSongs(data);
  }, []);

  useEffect(() => {
    fetchSongs();
    const interval = setInterval(fetchSongs, 3000);
    return () => clearInterval(interval);
  }, [fetchSongs]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/uploads", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Upload failed");
      }
      await fetchSongs();
    } catch {
      alert("Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleDelete(id: string, title: string) {
    if (!confirm(`Delete "${title}"?`)) return;
    await fetch(`/api/songs/${id}`, { method: "DELETE" });
    await fetchSongs();
  }

  return (
    <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">PracticePad</h1>
        <Button disabled={uploading} onClick={() => document.getElementById("file-upload")?.click()}>
          {uploading ? "Uploading..." : "Upload Song"}
        </Button>
        <input
          id="file-upload"
          type="file"
          accept=".mp3,.mp4,audio/mpeg,video/mp4"
          onChange={handleUpload}
          className="hidden"
        />
      </div>

      {songs.length === 0 ? (
        <div className="text-center py-20 text-neutral-400">
          <p className="text-lg mb-2">No songs yet</p>
          <p className="text-sm">Upload an MP3 or MP4 to get started</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {songs.map((song) => (
            <li
              key={song.id}
              className="flex items-center gap-3 p-4 bg-white rounded-xl border border-neutral-200 hover:border-neutral-300 transition-colors"
            >
              <div className="flex-1 min-w-0">
                {song.processingStatus === "ready" ? (
                  <Link
                    href={`/songs/${song.id}`}
                    className="text-base font-medium hover:underline truncate block"
                  >
                    {song.title}
                  </Link>
                ) : (
                  <span className="text-base font-medium truncate block text-neutral-400">
                    {song.title}
                  </span>
                )}
                <div className="flex items-center gap-2 mt-1 text-sm text-neutral-500">
                  {song.durationSec && <span>{formatDuration(song.durationSec)}</span>}
                  <span>{new Date(song.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {statusBadge(song.processingStatus)}
                <button
                  onClick={() => handleDelete(song.id, song.title)}
                  className="text-neutral-400 hover:text-red-500 text-sm p-1"
                  title="Delete"
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
