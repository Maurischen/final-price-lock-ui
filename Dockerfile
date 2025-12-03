FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY prisma ./prisma
RUN npm install

# Copy the rest of the source
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build the app
RUN npm run build

EXPOSE 3000

CMD ["sh", "-c", "npm run seed:price-guard && npm run start"]