FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 5000
# 1) seed admin wa kwanza (mara moja tu), 2) washa server
CMD ["sh", "-c", "node scripts/seedLocal.js && node src/server.js"]
