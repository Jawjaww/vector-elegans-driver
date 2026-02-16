FROM node:22-alpine

WORKDIR /app

RUN npm install -g expo

COPY package*.json ./
COPY tsconfig.json ./
COPY app.json ./
COPY eas.json ./

RUN npx expo install --quiet

COPY . .

EXPOSE 8081 19000 19001 19002

CMD ["npx", "expo", "start", "--tunnel"]
