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

async function run() {
  try {
    const code = "SAVE80";
    console.log("Creating 80% permanent discount...");
    const res = await fetchPaddle('/discounts', 'POST', {
      amount: "80",
      description: "80% Off Permanent Discount",
      type: "percentage",
      code: code,
      recur: true
    });
    
    console.log("Discount ID:", res.data.id);
    console.log("Discount Code:", res.data.code);
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
