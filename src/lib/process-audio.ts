import { execFile } from "child_process";
import path from "path";
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
          resolve({ sections: [], bpm: null });
          return;
        }
        try {
          const result = JSON.parse(stdout.trim());
          if (result && typeof result === "object" && Array.isArray(result.sections)) {
            // New format: { bpm, sections }
            resolve({ sections: result.sections, bpm: result.bpm ?? null });
          } else if (Array.isArray(result)) {
            // Legacy format: just sections array
            resolve({ sections: result, bpm: null });
          } else {
            console.error("Analysis returned error:", result);
            resolve({ sections: [], bpm: null });
          }
        } catch {
          console.error("Failed to parse analysis output:", stdout);
          resolve({ sections: [], bpm: null });
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

    // Save BPM
    if (analysis.bpm) {
      await prisma.song.update({
        where: { id: songId },
        data: { bpm: analysis.bpm },
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
