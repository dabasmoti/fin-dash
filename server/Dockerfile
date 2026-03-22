# Stage 1: Build - install all dependencies (including devDeps) and compile TypeScript
FROM node:20-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

# Stage 2: Runtime - install Chromium, production deps, and copy compiled output
FROM node:20-slim

# Install Chromium and all dependencies required by Puppeteer
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Skip Puppeteer's bundled Chromium download; use the system-installed binary
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Create a non-root user for running the application
RUN groupadd -r appuser && useradd -r -g appuser appuser

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled output from build stage
COPY --from=build /app/dist ./dist

# Create the data directory for SQLite and set ownership
RUN mkdir -p /app/data && chown -R appuser:appuser /app

USER appuser

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3001/api/health || exit 1

EXPOSE 3001

CMD ["node", "dist/index.js"]
