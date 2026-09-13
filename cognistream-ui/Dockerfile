FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# Expose Vite to the Docker network
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]