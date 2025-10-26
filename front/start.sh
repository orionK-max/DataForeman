#!/bin/bash

# Start script for the new DataForeman frontend
# This script ensures the frontend runs on port 5174

cd "$(dirname "$0")"

echo "🚀 Starting DataForeman Frontend..."
echo "📍 Server will be available at: http://localhost:5174"
echo ""

npm run dev
