FROM node:18
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --no-audit --no-fund

# Copy source and build
COPY . .
RUN npm run build

# Runtime env
ENV NODE_ENV=production
EXPOSE 4000
CMD ["npm","start"]


