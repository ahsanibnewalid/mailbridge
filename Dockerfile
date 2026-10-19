FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json ./
RUN npm install

FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG DATABASE_URL=postgresql://mailbridge:build_only@localhost:5432/mailbridge
ENV DATABASE_URL=$DATABASE_URL
ENV PROVIDER_ENCRYPTION_KEY_BASE64=MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=
RUN npm run db:generate && npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app ./
EXPOSE 3000
CMD ["npm", "run", "start"]
