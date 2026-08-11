FROM node:22-alpine

WORKDIR /app

# Copy package files and npm config (so .npmrc is applied) before install
COPY package*.json .npmrc ./

# Install build tools and skip optional native modules to avoid node-gyp failures
RUN apk add --no-cache python3 make g++ libusb-dev build-base \ 
	&& npm set unsafe-perm true \ 
	&& npm install --omit=dev --no-optional

COPY . .

CMD ["node", "src/server.js"]
