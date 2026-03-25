FROM node:20-slim AS base

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-venv \
    python3-pip \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app/app

# Set up Python virtual environment (at /app level, where the app expects it)
RUN python3 -m venv /app/.venv
RUN /app/.venv/bin/pip install --no-cache-dir librosa matplotlib scipy numpy anthropic

# Install Node dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy application code
COPY . .

# Copy scripts to parent directory (where process-audio.ts expects them)
RUN cp -r scripts /app/scripts

# Create data directories
RUN mkdir -p /app/data/audio /app/data/uploads

# Generate Prisma client
RUN npx prisma generate

# Build Next.js
RUN npm run build

# Expose port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0

CMD ["npm", "start"]
