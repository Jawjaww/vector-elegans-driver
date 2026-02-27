FROM node:22-slim

WORKDIR /app

RUN npm install -g expo

COPY package*.json ./

RUN rm -rf node_modules && npm install --legacy-peer-deps && npm cache clean --force

RUN rm -rf node_modules/@react-navigation/elements node_modules/@react-navigation/stack && npm install --legacy-peer-deps

# RUN npx expo install @react-navigation/native

COPY . .

# RUN npx expo install --check

EXPOSE 8081 19000 19001 19002

CMD ["npx", "expo", "start", "--tunnel"]
