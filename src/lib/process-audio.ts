import { execFile } from "child_process";
import path from "path";
import { unlink } from "fs/promises";
import { AUDIO_DIR } from "./paths";
import { prisma } from "./prisma";

const PROJECT_ROOT = path.resolve(process.cwd(), "..");
const PYTHON_BIN = path.join(PROJECT_ROOT, ".venv", "bin", "python3");
const ANALYZE_SCRIPT = path.join(PROJECT_ROOT, "scripts", "analyze.py");

interface AnalyzedSection {
  name: string;
  startSec: number;
  endSec: number;
}

interface AnalysisResult {
  sections: AnalyzedSection[];
  bpm: number | null;
  beats: number[];
}

async function extractMetadata(filePath: string): Promise<Record<string, string>> {
  return new Promise((resolve) => {
    execFile(
      "ffprobe",
      [
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        filePath,
      ],
      (error, stdout) => {
        if (error) {
          resolve({});
          return;
        }
        try {
          const data = JSON.parse(stdout);
          const tags = data?.format?.tags || {};
          // Normalize tag keys to lowercase
          const normalized: Record<string, string> = {};
          for (const [key, value] of Object.entries(tags)) {
            if (typeof value === "string" && value.trim()) {
              normalized[key.toLowerCase()] = value.trim();
            }
          }
          return resolve(normalized);
        } catch {
          resolve({});
        }
      }
    );
  });
}

async function analyzeAudio(audioPath: string, songTitle: string, originalFilename: string): Promise<AnalysisResult> {
  return new Promise(async (resolve) => {
    // Extract ID3/metadata tags from the original or normalized file
    const tags = await extractMetadata(audioPath);

    // Build song info string
    const infoParts: string[] = [];
    infoParts.push(`Title: ${tags.title || songTitle}`);
    if (tags.artist) infoParts.push(`Artist: ${tags.artist}`);
    if (tags.album) infoParts.push(`Album: ${tags.album}`);
    if (tags.genre) infoParts.push(`Genre: ${tags.genre}`);
    if (tags.date || tags.year) infoParts.push(`Year: ${tags.date || tags.year}`);
    infoParts.push(`Original filename: ${originalFilename}`);
    const songInfo = infoParts.join("\n");

    execFile(
      PYTHON_BIN,
      [ANALYZE_SCRIPT, audioPath, "--song-info", songInfo],
      {
        timeout: 120000, // 2 min timeout for analysis
        env: { ...process.env, ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "" },
      },
      (error, stdout, stderr) => {
        if (error) {
          console.error("Analysis failed:", stderr || error.message);
          resolve({ sections: [], bpm: null, beats: [] });
          return;
        }
        try {
          const result = JSON.parse(stdout.trim());
          if (result && typeof result === "object" && Array.isArray(result.sections)) {
            // New format: { bpm, sections, beats }
            resolve({
              sections: result.sections,
              bpm: result.bpm ?? null,
              beats: Array.isArray(result.beats) ? result.beats : [],
            });
          } else if (Array.isArray(result)) {
            // Legacy format: just sections array
            resolve({ sections: result, bpm: null, beats: [] });
          } else {
            console.error("Analysis returned error:", result);
            resolve({ sections: [], bpm: null, beats: [] });
          }
        } catch {
          console.error("Failed to parse analysis output:", stdout);
          resolve({ sections: [], bpm: null, beats: [] });
        }
      }
    );
  });
}

export async function processAudio(songId: string, inputPath: string) {
  const outputFilename = `${songId}.mp3`;
  const outputPath = path.join(AUDIO_DIR, outputFilename);

  try {
    // Update status to processing
    await prisma.song.update({
      where: { id: songId },
      data: { processingStatus: "processing" },
    });
    await prisma.importJob.update({
      where: { songId },
      data: { status: "processing", progressMessage: "Converting audio..." },
    });

    // Extract metadata from original file before conversion
    const tags = await extractMetadata(inputPath);
    if (Object.keys(tags).length > 0) {
      await prisma.song.update({
        where: { id: songId },
        data: {
          ...(tags.artist && { artist: tags.artist }),
          ...(tags.album && { album: tags.album }),
          ...(tags.genre && { genre: tags.genre }),
          ...((tags.date || tags.year) && { year: tags.date || tags.year }),
          // Update title from tags if the current title is just the filename
          ...(tags.title && { title: tags.title }),
        },
      });
    }

    // Run ffmpeg: extract audio, normalize to MP3 192k CBR, 44.1kHz stereo
    await new Promise<void>((resolve, reject) => {
      execFile(
        "ffmpeg",
        [
          "-i", inputPath,
          "-vn",              // no video
          "-ar", "44100",     // sample rate
          "-ac", "2",         // stereo
          "-b:a", "192k",     // bitrate
          "-f", "mp3",        // force mp3 format
          "-y",               // overwrite
          outputPath,
        ],
        { timeout: 300000 }, // 5 min timeout
        (error, _stdout, stderr) => {
          if (error) {
            reject(new Error(`ffmpeg failed: ${stderr || error.message}`));
          } else {
            resolve();
          }
        }
      );
    });

    // Get duration using ffprobe
    const duration = await new Promise<number | null>((resolve) => {
      execFile(
        "ffprobe",
        [
          "-v", "error",
          "-show_entries", "format=duration",
          "-of", "csv=p=0",
          outputPath,
        ],
        (error, stdout) => {
          if (error) {
            resolve(null);
          } else {
            const sec = parseFloat(stdout.trim());
            resolve(isNaN(sec) ? null : sec);
          }
        }
      );
    });

    // Auto-analyze sections
    await prisma.importJob.update({
      where: { songId },
      data: { progressMessage: "Analyzing sections..." },
    });

    const song = await prisma.song.findUnique({ where: { id: songId } });
    const analysis = await analyzeAudio(outputPath, song?.title || "", song?.originalFilename || "");

    // Save BPM and beat timestamps
    if (analysis.bpm || analysis.beats.length > 0) {
      await prisma.song.update({
        where: { id: songId },
        data: {
          ...(analysis.bpm && { bpm: analysis.bpm }),
          ...(analysis.beats.length > 0 && { beatTimestamps: JSON.stringify(analysis.beats) }),
        },
      });
    }

    // Save auto-detected sections
    const sections = analysis.sections;
    if (sections.length > 0) {
      await prisma.section.createMany({
        data: sections.map((s, i) => ({
          songId,
          name: s.name,
          startSec: s.startSec,
          endSec: s.endSec,
          orderIndex: i,
          autoDetected: true,
        })),
      });
    }

    // Update song as ready
    await prisma.song.update({
      where: { id: songId },
      data: {
        processingStatus: "ready",
        normalizedAudioPath: outputFilename,
        durationSec: duration,
      },
    });
    await prisma.importJob.update({
      where: { songId },
      data: { status: "completed", progressMessage: "Done" },
    });

    // Clean up original upload file (normalized version is what we use)
    try {
      await unlink(inputPath);
    } catch {
      // Not critical if cleanup fails
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await prisma.song.update({
      where: { id: songId },
      data: { processingStatus: "error", errorMessage: message },
    });
    await prisma.importJob.update({
      where: { songId },
      data: { status: "error", errorMessage: message },
    });
  }
}

export async function reanalyzeAudio(songId: string, audioPath: string) {
  try {
    await prisma.song.update({
      where: { id: songId },
      data: { processingStatus: "processing" },
    });

    const song = await prisma.song.findUnique({ where: { id: songId } });
    const analysis = await analyzeAudio(audioPath, song?.title || "", song?.originalFilename || "");

    // Update BPM and beat timestamps
    await prisma.song.update({
      where: { id: songId },
      data: {
        ...(analysis.bpm && { bpm: analysis.bpm }),
        beatTimestamps: analysis.beats.length > 0 ? JSON.stringify(analysis.beats) : null,
      },
    });

    // Delete old auto-detected sections (keep manually created ones)
    await prisma.section.deleteMany({
      where: { songId, autoDetected: true },
    });

    // Save new auto-detected sections
    if (analysis.sections.length > 0) {
      // Get max orderIndex of remaining manual sections
      const maxOrder = await prisma.section.aggregate({
        where: { songId },
        _max: { orderIndex: true },
      });
      const startIndex = (maxOrder._max.orderIndex ?? -1) + 1;

      await prisma.section.createMany({
        data: analysis.sections.map((s, i) => ({
          songId,
          name: s.name,
          startSec: s.startSec,
          endSec: s.endSec,
          orderIndex: startIndex + i,
          autoDetected: true,
        })),
      });
    }

    await prisma.song.update({
      where: { id: songId },
      data: { processingStatus: "ready" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Re-analysis failed";
    await prisma.song.update({
      where: { id: songId },
      data: { processingStatus: "ready", errorMessage: message },
    });
  }
}
