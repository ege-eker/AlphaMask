# ================= BUILD STAGE =================
FROM node:20 AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci
COPY . .

ARG MODE=prod
ENV MODE=${MODE}

RUN if [ "$MODE" = "prod" ]; then npm run build; fi


# ================= PRODUCTION SERVE =================
FROM nginx:1.25-alpine AS prod
WORKDIR /usr/share/nginx/html

COPY --from=build /app/dist ./
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]


# ================= DEVELOPMENT STAGE =================
FROM node:20 AS dev
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]