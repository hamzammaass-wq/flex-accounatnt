const fs = require('fs');
const API_KEY = process.env.PADDLE_API_KEY;
if (!API_KEY) {
  console.error('PADDLE_API_KEY environment variable is required.');
  process.exit(1);
}
const BASE_URL = 'https://api.paddle.com';

async function fetchPaddle(endpoint, method = 'GET', body = null) {
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'Paddle-Version': '1'
    }
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const res = await fetch(`${BASE_URL}${endpoint}`, options);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(JSON.stringify(data));
  }
  return data;
}

const subId = 'sub_01kxgwpr5bphmncs8hkthfbtzc';

async function run() {
  try {
    console.log("=== (c) Immediate Cancellation ===");
    console.log("Cancelling subscription immediately...");
    await fetchPaddle(`/subscriptions/${subId}/cancel`, 'POST', {
      effective_from: 'immediately'
    });
    console.log("Subscription cancelled immediately.");
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
