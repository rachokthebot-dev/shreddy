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

async function analyzeAudio(audioPath: string): Promise<AnalyzedSection[]> {
  return new Promise((resolve) => {
    execFile(
      PYTHON_BIN,
      [ANALYZE_SCRIPT, audioPath],
      { timeout: 120000 }, // 2 min timeout for analysis
      (error, stdout, stderr) => {
        if (error) {
          console.error("Analysis failed:", stderr || error.message);
          resolve([]); // Non-fatal: skip auto-sections on failure
          return;
        }
        try {
          const result = JSON.parse(stdout.trim());
          if (Array.isArray(result)) {
            resolve(result);
          } else {
            console.error("Analysis returned error:", result);
            resolve([]);
          }
        } catch {
          console.error("Failed to parse analysis output:", stdout);
          resolve([]);
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

    const sections = await analyzeAudio(outputPath);

    // Save auto-detected sections
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
