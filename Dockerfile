# Build the client
FROM node:26-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY shared shared
COPY client client
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
