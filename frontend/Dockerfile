FROM node:20-alpine AS build

WORKDIR /app
RUN apk upgrade --no-cache

ARG REACT_APP_API_URL
ENV REACT_APP_API_URL=${REACT_APP_API_URL}

COPY package.json ./
RUN npm install

COPY public ./public
COPY src ./src

RUN npm run build

FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

RUN apk upgrade --no-cache
RUN npm install -g serve@14.2.3

COPY --from=build /app/build ./build

EXPOSE 3000

CMD ["serve", "-s", "build", "-l", "3000"]
