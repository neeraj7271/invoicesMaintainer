FROM node:22-slim AS base
WORKDIR /app

FROM base AS deps
COPY package*.json ./
RUN npm ci

FROM deps AS build
COPY prisma ./prisma
RUN npx prisma generate
COPY server ./server
COPY client ./client
COPY tsconfig.json ./
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma
RUN npx prisma generate
COPY --from=build /app/dist ./dist
COPY --from=build /app/client/dist ./client/dist
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server/index.js"]
