# Build the client
FROM node:26-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY tsconfig.base.json ./
COPY shared shared
COPY client client
# Vite bakes VITE_ variables into the page at build time. Render passes a dashboard env var into a Docker build only when it is declared here.
ARG VITE_MAPBOX_TOKEN
RUN npm run build -w client

# Runtime: server source (run directly by Node) + built client
FROM node:26-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --omit=dev && npm cache clean --force
COPY shared shared
COPY server/src server/src
COPY --from=build /app/client/dist client/dist
USER node
EXPOSE 3000
CMD ["node", "server/src/index.ts"]
