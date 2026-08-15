FROM node:22-alpine

WORKDIR /app

# Copy package files first to maximize Docker layer caching.
COPY package*.json ./

# Install build tools and skip optional native modules to avoid node-gyp failures
RUN apk add --no-cache python3 make g++ libusb-dev build-base \
	&& npm set unsafe-perm true \
	&& npm install --omit=dev --omit=optional

COPY . .

CMD ["node", "src/server.js"]
