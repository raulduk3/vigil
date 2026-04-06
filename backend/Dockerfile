FROM oven/bun:1 AS base
WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

COPY . .

RUN mkdir -p data

EXPOSE 4000
CMD ["bun", "run", "src/index.ts"]
