FROM node:18-alpine
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --no-audit --no-fund

# Copy source and build
COPY . .
RUN npm install -g typescript
RUN npm run build

# Runtime env
ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000
CMD ["npm","start"]


