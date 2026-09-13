# syntax=docker/dockerfile:1
FROM --platform=$BUILDPLATFORM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY src ./src
RUN ./node_modules/.bin/esbuild src/oci/main.ts --bundle --platform=node --target=node24 --format=cjs --outfile=server.cjs --external:pg-native

FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=build --chown=1000:1000 /app/server.cjs ./server.cjs
USER 1000:1000
EXPOSE 8080
ENTRYPOINT ["node", "/app/server.cjs"]
