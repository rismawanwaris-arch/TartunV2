FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

# Buat folder untuk db dan uploads
RUN mkdir -p data uploads/avatars

# ZimaOS / Docker best practice: expose port and use volume
EXPOSE 3000

CMD ["node", "server.js"]
