# Stage 1: build the React client
FROM node:20-alpine AS client-build
WORKDIR /client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Stage 2: production server (serves API + pre-built client)
FROM node:20-alpine
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/src ./src
# Bring in built client so Express can serve it
COPY --from=client-build /client/dist ./client/dist
EXPOSE 3001
CMD ["node", "src/index.js"]
