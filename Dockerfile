# Use a recent Node
FROM node:20-alpine

# App directory
WORKDIR /app

# Install deps first (better cache)
COPY package*.json ./
RUN npm install --omit=dev

# Copy the rest of the source
COPY . .

# Build the app (React Router)
RUN npm run build

# Render will inject PORT, react-router-serve reads it
EXPOSE 3000

# Start the server
CMD ["npm", "run", "start"]
