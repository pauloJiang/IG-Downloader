FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src

RUN mkdir -p /tmp/ig-cache

ENV NODE_ENV=production
ENV CACHE_DIR=/tmp/ig-cache

CMD ["node", "src/index.js"]
