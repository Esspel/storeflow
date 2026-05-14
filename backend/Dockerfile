FROM node:20-slim

WORKDIR /app

# Install system deps needed by Prisma
RUN apt-get update && apt-get install -y openssl

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install

# Copy app source
COPY prisma ./prisma/
COPY src ./src
COPY tsconfig*.json ./
COPY nest-cli.json ./
COPY .eslintrc.js .prettierrc ./

# Prisma generate
RUN npx prisma generate

# Build app
RUN npm run build

EXPOSE 3000 3001

CMD ["npm", "run", "start:prod"]
