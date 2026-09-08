# Focusblocks — single container: Express API + static frontend + SQLite
FROM node:20-slim

# better-sqlite3 ships prebuilt binaries for common platforms; python/make are
# only needed if a build from source is triggered.
RUN apt-get update && apt-get install -y --no-install-recommends python3 build-essential \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data
VOLUME /data
EXPOSE 3000

CMD ["node", "server/index.js"]
