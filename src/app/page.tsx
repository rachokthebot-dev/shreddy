"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Star,
  FolderOpen,
  Trash2,
  Upload,
  Settings,
  Search,
  Plus,
  X,
  Music,
  Loader2,
  FolderInput,
} from "lucide-react";

interface Folder {
  id: string;
  name: string;
  _count: { songs: number };
}

interface Song {
  id: string;
  title: string;
  originalFilename: string;
  durationSec: number | null;
  processingStatus: string;
  pinned: boolean;
  folderId: string | null;
  folder: { id: string; name: string } | null;
  artist: string;
  album: string;
  genre: string;
  year: string;
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
      return null;
    case "processing":
      return (
        <Badge variant="secondary" className="gap-1">
          <Loader2 className="size-3 animate-spin" />
          Processing
        </Badge>
      );
    case "pending":
      return (
        <Badge variant="secondary" className="gap-1">
          <Loader2 className="size-3 animate-spin" />
          Pending
        </Badge>
      );
    case "error":
      return <Badge variant="destructive">Error</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function SongSkeleton() {
  return (
    <li className="flex items-center gap-3 p-4 bg-card rounded-xl border border-border animate-pulse">
      <div className="size-8 rounded-full bg-muted" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-muted rounded w-2/3" />
        <div className="h-3 bg-muted rounded w-1/3" />
      </div>
      <div className="h-5 w-12 bg-muted rounded" />
    </li>
  );
}

export default function LibraryPage() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Folder dialog
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [folderName, setFolderName] = useState("");

  // Move-to-folder dialog
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [movingSongId, setMovingSongId] = useState<string | null>(null);

  const fetchSongs = useCallback(async () => {
    try {
      const res = await fetch("/api/songs");
      if (!res.ok) throw new Error("Failed to load songs");
      const data = await res.json();
      setSongs(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load songs");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchFolders = useCallback(async () => {
    try {
      const res = await fetch("/api/folders");
      if (!res.ok) throw new Error("Failed to load folders");
      const data = await res.json();
      setFolders(data);
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    fetchSongs();
    fetchFolders();
    const interval = setInterval(fetchSongs, 3000);
    return () => clearInterval(interval);
  }, [fetchSongs, fetchFolders]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener("progress", (ev) => {
        if (ev.lengthComputable) {
          setUploadProgress(Math.round((ev.loaded / ev.total) * 100));
        }
      });

      await new Promise<void>((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            try {
              const data = JSON.parse(xhr.responseText);
              reject(new Error(data.error || "Upload failed"));
            } catch {
              reject(new Error("Upload failed"));
            }
          }
        };
        xhr.onerror = () => reject(new Error("Upload failed"));
        xhr.open("POST", "/api/uploads");
        xhr.send(formData);
      });

      await fetchSongs();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(0);
      e.target.value = "";
    }
  }

  async function handleDelete(id: string, title: string) {
    if (!confirm(`Delete "${title}"?`)) return;
    await fetch(`/api/songs/${id}`, { method: "DELETE" });
    await fetchSongs();
  }

  async function handleTogglePin(id: string, currentPinned: boolean) {
    await fetch(`/api/songs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !currentPinned }),
    });
    await fetchSongs();
  }

  async function handleMoveSong(songId: string, folderId: string | null) {
    await fetch(`/api/songs/${songId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId: folderId }),
    });
    setMoveDialogOpen(false);
    setMovingSongId(null);
    await fetchSongs();
    await fetchFolders();
  }

  function openNewFolder() {
    setEditingFolder(null);
    setFolderName("");
    setFolderDialogOpen(true);
  }

  function openEditFolder(folder: Folder) {
    setEditingFolder(folder);
    setFolderName(folder.name);
    setFolderDialogOpen(true);
  }

  async function saveFolder() {
    if (!folderName.trim()) return;
    if (editingFolder) {
      await fetch(`/api/folders/${editingFolder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: folderName }),
      });
    } else {
      await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: folderName }),
      });
    }
    setFolderDialogOpen(false);
    await fetchFolders();
  }

  async function deleteFolder(id: string, name: string) {
    if (!confirm(`Delete folder "${name}"? Songs will be moved to unfiled.`)) return;
    await fetch(`/api/folders/${id}`, { method: "DELETE" });
    if (activeFolder === id) setActiveFolder(null);
    await fetchFolders();
    await fetchSongs();
  }

  // Filter songs by folder and search
  const filteredSongs = songs.filter((s) => {
    if (activeFolder && s.folderId !== activeFolder) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q) || s.originalFilename.toLowerCase().includes(q);
    }
    return true;
  });

  const pinnedSongs = filteredSongs.filter((s) => s.pinned);
  const unpinnedSongs = filteredSongs.filter((s) => !s.pinned);

  function renderSong(song: Song) {
    return (
      <li
        key={song.id}
        className="flex items-center gap-3 p-4 bg-card rounded-xl border border-border hover:border-ring/30 active:scale-[0.99] transition-all"
      >
        {/* Pin button */}
        <button
          onClick={() => handleTogglePin(song.id, song.pinned)}
          className={`shrink-0 p-2 -m-2 rounded-full active:scale-90 transition-transform ${
            song.pinned ? "text-amber-500" : "text-muted-foreground/40 hover:text-amber-400"
          }`}
          title={song.pinned ? "Unpin" : "Pin"}
        >
          <Star className="size-5" fill={song.pinned ? "currentColor" : "none"} />
        </button>

        <div className="flex-1 min-w-0">
          {song.processingStatus === "ready" ? (
            <Link
              href={`/songs/${song.id}`}
              className="text-[15px] font-medium hover:underline truncate block text-foreground"
            >
              {song.title}
            </Link>
          ) : (
            <span className="text-[15px] font-medium truncate block text-muted-foreground">
              {song.title}
            </span>
          )}
          <div className="flex items-center gap-1.5 mt-0.5 text-[13px] text-muted-foreground flex-wrap">
            {song.artist && (
              <>
                <span className="text-foreground/60">{song.artist}</span>
                <span className="text-muted-foreground/40">·</span>
              </>
            )}
            {song.durationSec ? <span>{formatDuration(song.durationSec)}</span> : null}
            {song.folder && !activeFolder && (
              <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{song.folder.name}</span>
            )}
            {song.genre && (
              <span className="text-xs bg-muted px-1.5 py-0.5 rounded-full">{song.genre}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {statusBadge(song.processingStatus)}
          <button
            onClick={() => { setMovingSongId(song.id); setMoveDialogOpen(true); }}
            className="p-2.5 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-muted active:scale-90 transition-all"
            title="Move to folder"
          >
            <FolderInput className="size-4" />
          </button>
          <button
            onClick={() => handleDelete(song.id, song.title)}
            className="p-2.5 rounded-lg text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 active:scale-90 transition-all"
            title="Delete"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </li>
    );
  }

  return (
    <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">PracticePad</h1>
        <div className="flex items-center gap-1.5">
          <Link
            href="/settings"
            className="p-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted active:scale-90 transition-all"
            title="Settings"
          >
            <Settings className="size-5" />
          </Link>
          <Button
            disabled={uploading}
            onClick={() => document.getElementById("file-upload")?.click()}
            className="gap-1.5 h-9 px-3"
          >
            {uploading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {uploadProgress > 0 ? `${uploadProgress}%` : "Uploading..."}
              </>
            ) : (
              <>
                <Upload className="size-4" />
                Upload
              </>
            )}
          </Button>
        </div>
        <input
          id="file-upload"
          type="file"
          accept=".mp3,.mp4,audio/mpeg,video/mp4"
          onChange={handleUpload}
          className="hidden"
        />
      </div>

      {/* Upload progress bar */}
      {uploading && uploadProgress > 0 && (
        <div className="mb-4 h-1 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300 rounded-full"
            style={{ width: `${uploadProgress}%` }}
          />
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="Search songs..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 h-10 bg-card"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {/* Folder tabs */}
      <div className="flex items-center gap-1.5 mb-5 overflow-x-auto pb-1 -mx-1 px-1">
        <button
          onClick={() => setActiveFolder(null)}
          className={`px-3.5 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors active:scale-95 ${
            activeFolder === null
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-accent"
          }`}
        >
          All ({songs.length})
        </button>
        {folders.map((folder) => (
          <button
            key={folder.id}
            onClick={() => setActiveFolder(folder.id)}
            onDoubleClick={() => openEditFolder(folder)}
            className={`px-3.5 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors active:scale-95 ${
              activeFolder === folder.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {folder.name} ({folder._count.songs})
          </button>
        ))}
        <button
          onClick={openNewFolder}
          className="p-2 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground active:scale-90 transition-all"
          title="New folder"
        >
          <Plus className="size-4" />
        </button>
        {activeFolder && (
          <button
            onClick={() => {
              const folder = folders.find((f) => f.id === activeFolder);
              if (folder) deleteFolder(folder.id, folder.name);
            }}
            className="p-2 rounded-full text-muted-foreground hover:text-destructive active:scale-90 transition-all"
            title="Delete folder"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center size-14 rounded-full bg-destructive/10 mb-4">
            <X className="size-6 text-destructive" />
          </div>
          <p className="text-base font-medium text-foreground mb-1">Something went wrong</p>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <Button variant="outline" onClick={() => { setError(null); setLoading(true); fetchSongs(); }}>
            Try again
          </Button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !error && (
        <ul className="space-y-2">
          <SongSkeleton />
          <SongSkeleton />
          <SongSkeleton />
        </ul>
      )}

      {/* Song list */}
      {!loading && !error && (
        <>
          {filteredSongs.length === 0 ? (
            <div className="text-center py-20">
              <div className="inline-flex items-center justify-center size-16 rounded-full bg-muted mb-4">
                {searchQuery ? (
                  <Search className="size-7 text-muted-foreground" />
                ) : (
                  <Music className="size-7 text-muted-foreground" />
                )}
              </div>
              <p className="text-base font-medium text-foreground mb-1">
                {searchQuery
                  ? "No matching songs"
                  : activeFolder
                  ? "No songs in this folder"
                  : "No songs yet"}
              </p>
              <p className="text-sm text-muted-foreground">
                {searchQuery
                  ? "Try a different search term"
                  : "Upload an MP3 or MP4 to get started"}
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {pinnedSongs.length > 0 && (
                <div>
                  <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2 px-1">
                    Practicing Now
                  </h2>
                  <ul className="space-y-2">
                    {pinnedSongs.map(renderSong)}
                  </ul>
                </div>
              )}

              {unpinnedSongs.length > 0 && (
                <div>
                  {pinnedSongs.length > 0 && (
                    <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2 mt-2 px-1">
                      Library
                    </h2>
                  )}
                  <ul className="space-y-2">
                    {unpinnedSongs.map(renderSong)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Folder create/edit dialog */}
      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingFolder ? "Rename Folder" : "New Folder"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Input
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="Folder name"
              onKeyDown={(e) => e.key === "Enter" && saveFolder()}
              autoFocus
              className="h-10"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setFolderDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={saveFolder}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Move to folder dialog */}
      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Move to Folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-1 pt-2">
            <button
              onClick={() => movingSongId && handleMoveSong(movingSongId, null)}
              className="w-full text-left px-3 py-3 rounded-lg hover:bg-muted active:bg-accent text-sm transition-colors"
            >
              No folder (unfiled)
            </button>
            {folders.map((folder) => (
              <button
                key={folder.id}
                onClick={() => movingSongId && handleMoveSong(movingSongId, folder.id)}
                className="w-full text-left px-3 py-3 rounded-lg hover:bg-muted active:bg-accent text-sm flex items-center gap-2 transition-colors"
              >
                <FolderOpen className="size-4 text-muted-foreground" />
                {folder.name}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
