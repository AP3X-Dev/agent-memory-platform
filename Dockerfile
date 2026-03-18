FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/redis/package.json packages/redis/
COPY packages/neo4j/package.json packages/neo4j/
COPY packages/mcp/package.json packages/mcp/

RUN npm ci --production

COPY packages/ packages/
COPY tsconfig.json ./

RUN npx tsx --version

EXPOSE 3101

CMD ["npx", "tsx", "packages/mcp/src/server.ts"]
