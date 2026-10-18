FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci

ARG VITE_KEYCLOAK_URL
ARG VITE_KEYCLOAK_REALM
ARG VITE_KEYCLOAK_CLIENT_ID

COPY . .

RUN for v in VITE_KEYCLOAK_URL VITE_KEYCLOAK_REALM VITE_KEYCLOAK_CLIENT_ID; do \
      [ -z "$(printenv $v)" ] && unset $v; \
    done; \
    npm run build

FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

RUN find /usr/share/nginx/html -type f -exec chmod 644 {} \; && \
    find /usr/share/nginx/html -type d -exec chmod 755 {} \;

COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
