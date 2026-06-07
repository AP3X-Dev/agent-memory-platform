FROM node:20-alpine

RUN addgroup -S memberry && adduser -S memberry -G memberry

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/redis/package.json packages/redis/
COPY packages/neo4j/package.json packages/neo4j/
COPY packages/mcp/package.json packages/mcp/
COPY packages/research/package.json packages/research/
COPY packages/arch/package.json packages/arch/
COPY packages/code/package.json packages/code/
COPY packages/retrieval/package.json packages/retrieval/

RUN npm ci --production

COPY packages/ packages/
COPY tsconfig.json tsconfig.build.json ./

RUN chown -R memberry:memberry /app

USER memberry

EXPOSE 3101

CMD ["npx", "tsx", "packages/mcp/src/server.ts"]
