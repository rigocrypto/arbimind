# ArbiMind Backend - Deterministic deploy (bypasses Railpack/Nixpacks)
FROM node:18-alpine
WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

EXPOSE 8000
ENV PORT=8000
CMD ["npm", "start"]
