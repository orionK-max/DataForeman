#!/usr/bin/env node
const crypto = require('crypto');
const { Client } = require('pg');

function b64u(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function generateToken() {
  // Connect to database to get admin user ID
  const client = new Client({
    host: process.env.PGHOST || 'localhost',
    port: process.env.PGPORT || 5432,
    database: process.env.PGDATABASE || 'dataforeman',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
  });

  try {
    await client.connect();
    
    // Get admin user ID
    const result = await client.query(`
      SELECT u.id 
      FROM users u 
      JOIN user_roles ur ON u.id = ur.user_id 
      JOIN roles r ON ur.role_id = r.id
      WHERE r.name = 'admin' 
      LIMIT 1
    `);
    
    if (result.rows.length === 0) {
      console.error('No admin user found in database');
      process.exit(1);
    }
    
    const adminUserId = result.rows[0].id;
    
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const payload = { sub: adminUserId, role: 'admin', iat: now, exp: now + 24 * 60 * 60 };
    const secret = process.env.JWT_SECRET || 'change-me';

    const h = b64u(JSON.stringify(header));
    const p = b64u(JSON.stringify(payload));
    const data = `${h}.${p}`;
    const sig = crypto
      .createHmac('sha256', secret)
      .update(data)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    console.log(`${data}.${sig}`);
  } finally {
    await client.end();
  }
}

generateToken().catch(err => {
  console.error('Failed to generate token:', err.message);
  process.exit(1);
});
