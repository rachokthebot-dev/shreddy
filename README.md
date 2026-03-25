# Shreddy

A local-first guitar practice companion web app. Upload songs or import from YouTube, get AI-powered section detection, and practice with tempo control, pitch shifting, section looping, and a built-in metronome. Optimized for iPad Safari.

![Library](screenshots/library.png)

## Features

### Song Library
- **Upload MP3/MP4** files or **import from YouTube** by URL
- **AI-powered section detection** — uses librosa audio analysis + Claude Vision to automatically identify Intro, Verse, Chorus, Bridge, Solo, Outro, etc.
- **Auto-detected metadata** — BPM, musical key, artist, album, genre, year (from ID3 tags or YouTube)
- **Folder organization** — create folders, move songs between them
- **Pin songs** to the top of the library
- **Search and sort** by title, artist, date added, or recent

### Practice Player

![Practice Page](screenshots/practice.png)

- **Visual waveform timeline** with color-coded sections — see the full song structure at a glance
- **Tempo control** — slow down to 0.5x or speed up to 1.2x without affecting pitch
- **Pitch shifting** — transpose up or down by up to 12 semitones without affecting duration (server-side processing via ffmpeg, cached per song/pitch)
- **Musical key display** — auto-detected key adjusts when you shift pitch (e.g., A Minor + 2 = B Minor)
- **Section looping** — tap any section to loop it, shift-tap for multi-section ranges
- **A-B looping** — set custom loop points anywhere in the song
- **Whole-song loop** toggle
- **Loop counter** — tracks how many times you've looped each section
- **Built-in metronome** with beat sync, volume control, count-in, tap tempo, and visual beat indicator
- **Practice notes** — add free-text notes per song
- **Re-analyze** — re-run AI section detection with one tap
- **Remembers state** — last position, tempo, pitch, and selected sections are restored on next visit

### Practice Stats

![Stats](screenshots/stats.png)

- **Daily, weekly, and all-time** practice time and session counts
- **Practice streak** tracking (consecutive days)
- **7-day bar chart** showing daily practice duration
- **Top 5 most-practiced songs** this week with time and session counts
- Per-section practice logs (loop counts and time spent)

### Settings

![Settings](screenshots/settings.png)

- **Dark / light mode**
- **Anthropic API key** management (set in UI or via environment variable)
- **System health check** — see which dependencies are installed and which need attention
- **YouTube import** max duration setting
- **Custom analysis prompt** — modify the Claude Vision prompt used for section detection

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS v4, shadcn/ui
- **Database**: SQLite via Prisma with libSQL adapter
- **Audio processing**: ffmpeg/ffprobe for normalization and pitch shifting
- **Audio analysis**: Python (librosa) for BPM, key, beat detection + Claude Vision API for intelligent section segmentation
- **YouTube import**: yt-dlp

## Setup

### Option 1: Docker (recommended)

The fastest way to get Shreddy running:

```bash
# Clone the repo
git clone https://github.com/rachokthebot-dev/shreddy.git
cd shreddy

# Start with Docker Compose
docker compose up -d

# With an Anthropic API key for AI section detection (optional)
ANTHROPIC_API_KEY=your_key_here docker compose up -d
```

Open `http://localhost:3000` (or `http://<your-ip>:3000` from iPad).

Data is persisted in a Docker volume. To stop: `docker compose down`.

### Option 2: Manual Install

#### Prerequisites

| Dependency | Required | Install |
|---|---|---|
| Node.js 20+ | Yes | [nodejs.org](https://nodejs.org) |
| Python 3.10+ | Yes | `brew install python` (macOS) |
| ffmpeg | Yes | `brew install ffmpeg` (macOS) or `apt install ffmpeg` (Linux) |
| yt-dlp | Optional | `brew install yt-dlp` (macOS) or `pip install yt-dlp` |
| Anthropic API key | Optional | [console.anthropic.com](https://console.anthropic.com) |

#### Install

```bash
# Clone the repo
git clone https://github.com/rachokthebot-dev/shreddy.git
cd shreddy

# Set up Python environment
python3 -m venv .venv
source .venv/bin/activate
pip install librosa matplotlib scipy numpy anthropic

# Install Node dependencies
cd app
npm install

# Set up the database
npx prisma migrate dev

# (Optional) Set your API key — you can also do this in the Settings UI
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
```

#### Run

```bash
# Development (local only)
cd app
npm run dev

# Development (accessible from iPad on local network)
npx next dev --hostname 0.0.0.0 --webpack

# Production (recommended for iPad)
npm run build && npm start
```

Access from iPad at `http://<your-mac-ip>:3000`.

### Verify Setup

After starting, go to **Settings** to see the **System Dependencies** section. It shows which dependencies are installed and provides install instructions for any that are missing.

### API Key

You can set the Anthropic API key in three ways (in priority order):
1. **Environment variable**: `ANTHROPIC_API_KEY=sk-ant-... npm start`
2. **`.env` file**: Add `ANTHROPIC_API_KEY=sk-ant-...` to `app/.env`
3. **Settings UI**: Go to Settings and enter it in the API Key field

Without an API key, Shreddy still works — audio analysis falls back to local-only mode (BPM, key, and beat detection still work via librosa, but AI section detection is skipped).

### Troubleshooting

| Problem | Solution |
|---|---|
| "ffmpeg not installed" error on upload | Install ffmpeg: `brew install ffmpeg` (macOS) or `apt install ffmpeg` (Linux) |
| "Python virtual environment not found" | Run `python3 -m venv .venv && source .venv/bin/activate && pip install librosa matplotlib scipy numpy anthropic` from the project root |
| YouTube import fails | Install yt-dlp: `brew install yt-dlp` (macOS). Also check Settings > YouTube Max Duration |
| Sections not detected | Set an Anthropic API key (see above). Without it, section detection is skipped |
| Can't access from iPad | Use `--hostname 0.0.0.0` flag, or use production mode (`npm run build && npm start`). Ensure Mac and iPad are on the same network |
| Pitch shifting slow | First pitch shift for a song takes a few seconds (ffmpeg processing). Subsequent requests for the same pitch are instant (cached) |

## Architecture

```
shreddy/
├── app/                    # Next.js application
│   ├── prisma/             # Database schema & migrations
│   ├── src/
│   │   ├── app/            # Pages and API routes
│   │   │   ├── page.tsx           # Song library
│   │   │   ├── songs/[id]/        # Practice player
│   │   │   ├── stats/             # Practice statistics
│   │   │   ├── settings/          # App settings
│   │   │   └── api/               # REST API endpoints
│   │   ├── hooks/          # Custom React hooks (metronome, pitch shifter)
│   │   ├── components/     # shadcn/ui components
│   │   └── lib/            # Server utilities (audio processing, DB)
│   └── package.json
├── scripts/
│   └── analyze.py          # Audio analysis + Claude Vision integration
└── data/                   # SQLite DB, audio files, uploads
```

## License

MIT
