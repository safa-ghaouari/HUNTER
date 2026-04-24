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

FROM nginx:1.27-alpine

RUN apk upgrade --no-cache

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
