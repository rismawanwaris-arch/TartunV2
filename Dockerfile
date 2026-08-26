FROM node:20-slim

WORKDIR /app

# Install build dependencies for compiling sqlite3 native addon
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Install dependencies and build sqlite3 from source for current system libc
COPY package*.json ./
RUN npm install --build-from-source=sqlite3 --omit=dev

COPY . .

# Buat folder untuk db dan uploads jika belum ada
RUN mkdir -p data uploads/avatars

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "server.js"]
