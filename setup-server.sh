#!/bin/bash
# Run this once on the AWS server to set up the inventory backend
# ssh ubuntu@13.205.235.156 then paste and run

set -e

# Clone the repo (replace with actual repo URL after creating on GitHub)
cd /var/www
git clone https://github.com/YOUR_USERNAME/hms-inventory-backend.git || true
cd hms-inventory-backend

# Install dependencies
npm ci

# Create .env
cat > .env <<'ENV'
DATABASE_URL="mysql://root:@localhost:3306/hms_inventory"
JWT_SECRET="inventory_super_secret_jwt_2026"
PORT=5001
ENV

# Generate Prisma client and migrate
npx prisma generate
npx prisma migrate deploy

# Start with PM2
pm2 start src/index.js --name hms-inventory-backend
pm2 save

# Seed initial data
sleep 2
curl -X POST http://localhost:5001/api/auth/seed
curl -X POST http://localhost:5001/api/seed

echo "Inventory backend setup complete on port 5001"
