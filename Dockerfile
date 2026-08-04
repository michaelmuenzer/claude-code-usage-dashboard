FROM node:22.12.0-slim AS base
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS dev
COPY . .
CMD ["sh", "-c", "npm run vendor && npm run dev"]

FROM base AS build
COPY . .
RUN npm run build

FROM node:22.12.0-slim AS production
WORKDIR /app
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/dist dist
COPY --from=build /app/public public
COPY --from=build /app/package.json package.json
EXPOSE 3001
CMD ["node", "dist/server.js"]
