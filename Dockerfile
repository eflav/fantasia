FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY public ./public
COPY samples ./samples
COPY Makefile README.md LICENSE ./

ENV NODE_ENV=production
ENV PORT=3920

# Persist memory/artifacts via volumes in production if desired
RUN mkdir -p /app/workspace /app/.fantasia

EXPOSE 3920

CMD ["npm", "run", "start:web"]
