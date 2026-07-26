FROM node:22-slim

# better-sqlite3 is a native module and needs a toolchain to build.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

# Railway mounts a volume here; without one the database is lost on redeploy.
ENV DATABASE_PATH=/data/formd.db
ENV PORT=8080
EXPOSE 8080

CMD ["node", "src/server.js"]
