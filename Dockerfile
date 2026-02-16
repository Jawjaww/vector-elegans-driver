FROM node:20-alpine

WORKDIR /app

RUN npm install -g expo-cli

COPY package*.json ./
COPY tsconfig.json ./
COPY app.json ./
COPY eas.json ./

RUN npm install

COPY . .

EXPOSE 8081 19000 19001 19002

CMD ["npx", "expo", "start", "--tunnel"]
