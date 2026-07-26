FROM node:22-slim

# better-sqlite3 is a native module and needs a toolchain to build.
# libreoffice-writer converts uploaded .docx to PDF at import; without it
# /forms/import answers 501 for .docx and still serves PDFs normally. Drop it
# if you only ever import PDFs — it is by far the largest layer here.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ libreoffice-writer \
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
