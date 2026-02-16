FROM expo/eas-cli:latest

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the app
COPY . .

# Expose Metro bundler port
EXPOSE 8081

# Default command
CMD ["npx", "expo", "start", "--tunnel"]
