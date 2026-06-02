FROM node:20

RUN apt-get update && \
    apt-get install -y yt-dlp && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN mkdir -p /tmp/ig-cache

ENV NODE_ENV=production
ENV CACHE_DIR=/tmp/ig-cache

CMD ["npm", "start"]
