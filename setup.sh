#!/bin/bash

echo "📥 Cloning the repository..."
git clone https://github.com/celebrity4000/node-express-ts-pg.git
cd node-express-ts-pg || exit

echo "📦 Installing npm dependencies..."
npm install

echo "📄 Checking for .env..."
if [ ! -f .env ]; then
    echo "⚠️ No .env file found. Creating one from example..."
    cp .env.example .env
fi

echo "📁 Compiling TypeScript..."
npx tsc

echo "🔄 Starting server using nodemon..."
npx nodemon src/server.ts
echo "🚀 Server started successfully!"
