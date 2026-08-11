FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++ libusb-dev build-base

COPY package*.json .npmrc ./
RUN npm set unsafe-perm true && npm install --omit=dev --no-optional

COPY . .

CMD ["node", "src/server.js"]
