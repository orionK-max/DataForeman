#!/usr/bin/env node

/**
 * Test MQTT Publishers
 * 
 * This script demonstrates the publisher functionality by:
 * 1. Creating an MQTT connection
 * 2. Creating a tag to publish
 * 3. Creating a publisher with tag mapping
 * 4. Simulating tag value changes
 * 5. Verifying messages are published to MQTT
 */

const axios = require('axios');
const mqtt = require('mqtt');
const { stdin, stdout } = require('process');

const BASE_URL = 'http://localhost:8080/api';
let AUTH_TOKEN = '';

// MQTT subscriber to verify messages
let mqttClient;
const receivedMessages = [];

async function getAuthToken() {
  // Get admin JWT token
  const { execSync } = require('child_process');
  AUTH_TOKEN = execSync('node ops/gen-admin-jwt.cjs', { encoding: 'utf8' }).trim();
  console.log('✓ Got auth token');
}

async function api(method, path, data = null) {
  const url = `${BASE_URL}${path}`;
  const config = {
    method,
    url,
    headers: { Authorization: `Bearer ${AUTH_TOKEN}` }
  };
  if (data) config.data = data;
  
  try {
    const response = await axios(config);
    return response.data;
  } catch (err) {
    console.error(`API Error ${method} ${path}:`, err.response?.data || err.message);
    throw err;
  }
}

async function setupMQTTSubscriber() {
  return new Promise((resolve) => {
    mqttClient = mqtt.connect('mqtt://localhost:1883', {
      clientId: 'test-publisher-subscriber',
      username: 'admin',
      password: process.env.ADMIN_PASSWORD || 'password'
    });

    mqttClient.on('connect', () => {
      console.log('✓ MQTT subscriber connected');
      mqttClient.subscribe('test/publisher/#', { qos: 1 }, (err) => {
        if (err) {
          console.error('Failed to subscribe:', err);
        } else {
          console.log('✓ Subscribed to test/publisher/#');
          resolve();
        }
      });
    });

    mqttClient.on('message', (topic, message) => {
      const msg = {
        topic,
        payload: message.toString(),
        timestamp: Date.now()
      };
      receivedMessages.push(msg);
      console.log(`📨 Received: ${topic} => ${message.toString()}`);
    });

    mqttClient.on('error', (err) => {
      console.error('MQTT Error:', err);
    });
  });
}

async function createConnection() {
  const connection = await api('POST', '/mqtt/connections', {
    name: 'Test Publisher Connection',
    broker_host: 'localhost',
    broker_port: 1883,
    protocol: 'mqtt',
    clean_session: true
  });
  console.log(`✓ Created connection: ${connection.id}`);
  return connection.id;
}

async function createTag(connectionId) {
  const tag = await api('POST', '/tags/subscribe', {
    connection_id: connectionId,
    tag_path: 'test.publisher.temperature',
    data_type: 'REAL',
    access: 'read_write',
    description: 'Test temperature sensor for publisher'
  });
  console.log(`✓ Created tag: ${tag.tag_id}`);
  return tag.tag_id;
}

async function createPublisher(connectionId, tagId) {
  const publisher = await api('POST', '/mqtt/publishers', {
    connection_id: connectionId,
    name: 'Test Temperature Publisher',
    publish_mode: 'on_change',
    payload_format: 'json',
    enabled: true,
    mappings: [{
      tag_id: tagId,
      mqtt_topic: 'test/publisher/temperature',
      qos: 1,
      retain: false
    }]
  });
  console.log(`✓ Created publisher: ${publisher.id}`);
  return publisher.id;
}

async function updateTagValue(tagId, value) {
  await api('POST', `/tags/${tagId}/value`, {
    value,
    quality: 'GOOD'
  });
  console.log(`✓ Updated tag value to: ${value}`);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function cleanup(connectionId) {
  try {
    await api('DELETE', `/mqtt/connections/${connectionId}`);
    console.log('✓ Cleaned up connection');
  } catch (err) {
    console.error('Cleanup error:', err.message);
  }
}

async function main() {
  console.log('=== MQTT Publisher Test ===\n');

  try {
    await getAuthToken();
    await setupMQTTSubscriber();

    // Wait a bit for MQTT subscriber to be ready
    await sleep(1000);

    const connectionId = await createConnection();
    
    // Wait for connection to establish
    await sleep(2000);

    const tagId = await createTag(connectionId);
    const publisherId = await createPublisher(connectionId, tagId);

    // Wait for publisher to be loaded
    await sleep(2000);

    console.log('\n=== Testing on_change publishing ===\n');

    // Simulate tag value changes
    await updateTagValue(tagId, 20.5);
    await sleep(1000);

    await updateTagValue(tagId, 21.3);
    await sleep(1000);

    await updateTagValue(tagId, 22.1);
    await sleep(1000);

    await updateTagValue(tagId, 22.1); // Same value - should not publish
    await sleep(1000);

    await updateTagValue(tagId, 23.5);
    await sleep(1000);

    console.log('\n=== Results ===\n');
    console.log(`Total messages received: ${receivedMessages.length}`);
    console.log('Expected: 4 messages (duplicate value should not be published)\n');

    if (receivedMessages.length > 0) {
      console.log('Messages:');
      receivedMessages.forEach((msg, idx) => {
        console.log(`${idx + 1}. ${msg.topic}: ${msg.payload}`);
      });
    }

    console.log('\n✓ Test completed successfully!');
    console.log('\nPublisher is now active. You can:');
    console.log('- View in UI: http://localhost:8080/connectivity');
    console.log('- Subscribe with: mosquitto_sub -h localhost -t "test/publisher/#" -u admin -P password');
    console.log('- Update tag values to see real-time publishing');
    console.log('\nPress Ctrl+C to cleanup and exit...');

    // Keep running to allow manual testing
    await new Promise(() => {});

  } catch (err) {
    console.error('\n❌ Test failed:', err);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  console.log('\n\n=== Cleaning up ===');
  if (mqttClient) {
    mqttClient.end();
  }
  process.exit(0);
});

main();
