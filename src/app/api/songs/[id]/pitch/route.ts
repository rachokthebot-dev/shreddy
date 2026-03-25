import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { access } from "fs/promises";
import path from "path";
import { AUDIO_DIR } from "@/lib/paths";

function pitchFilename(songId: string, semitones: number): string {
  const sign = semitones >= 0 ? "up" : "down";
  return `${songId}_pitch_${sign}${Math.abs(semitones)}.mp3`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { semitones } = await request.json();

  if (typeof semitones !== "number" || semitones === 0 || semitones < -12 || semitones > 12) {
    return NextResponse.json({ error: "semitones must be between -12 and 12, non-zero" }, { status: 400 });
  }

  const sourceFile = path.join(AUDIO_DIR, `${id}.mp3`);
  try {
    await access(sourceFile);
  } catch {
    return NextResponse.json({ error: "Source audio not found" }, { status: 404 });
  }

  const outFilename = pitchFilename(id, semitones);
  const outPath = path.join(AUDIO_DIR, outFilename);

  // Return cached version if it exists
  try {
    await access(outPath);
    return NextResponse.json({ filename: outFilename });
  } catch {
    // Need to generate
  }

  // factor = 2^(semitones/12)
  const factor = Math.pow(2, semitones / 12);
  const invFactor = 1 / factor;

  // asetrate changes pitch (and speed), aresample restores sample rate,
  // atempo compensates for the speed change to preserve duration
  const filterChain = `asetrate=44100*${factor},aresample=44100,atempo=${invFactor}`;

  return new Promise<NextResponse>((resolve) => {
    execFile(
      "ffmpeg",
      [
        "-y",
        "-i", sourceFile,
        "-af", filterChain,
        "-b:a", "192k",
        "-vn",
        outPath,
      ],
      { timeout: 120000 },
      (error, _stdout, stderr) => {
        if (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            resolve(NextResponse.json(
              { error: "ffmpeg is not installed. Install it with: brew install ffmpeg (macOS) or apt install ffmpeg (Linux)" },
              { status: 500 }
            ));
            return;
          }
          console.error("ffmpeg pitch shift failed:", stderr);
          resolve(NextResponse.json({ error: "Pitch processing failed" }, { status: 500 }));
          return;
        }
        resolve(NextResponse.json({ filename: outFilename }));
      }
    );
  });
}
