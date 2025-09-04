FROM node:18
WORKDIR /app

# Install dependencies
COPY package*.json ./
# Use npm install to avoid lockfile-sync failures in CI (serverless-http added)
RUN npm install --no-audit --no-fund

# Copy source and build
COPY . .
RUN npm install -g typescript && npm run build

# Runtime env
ENV NODE_ENV=production
EXPOSE 4000
CMD ["npm","start"]


