const fs = require('fs');

const API_KEY = process.env.PADDLE_API_KEY || 'pdl_live_apikey_01kxgvngw52jb6tk8vb386xvqr_c3jywNeShgA4rjkSmYTz4M_AbY';
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
    const webhookUrl = 'https://us-central1-smart-account-cc181.cloudfunctions.net/paddleSubscriptionNotifications';
    console.log("Creating webhook destination for:", webhookUrl);
    
    // We subscribe to all subscription related events
    const subscribedEvents = [
      "subscription.created",
      "subscription.updated",
      "subscription.canceled",
      "subscription.past_due",
      "subscription.activated",
      "transaction.completed",
      "transaction.paid"
    ];

    const destRes = await fetchPaddle('/notification-settings', 'POST', {
      description: 'Live Firebase Function Webhook',
      destination: webhookUrl,
      type: 'url',
      subscribed_events: subscribedEvents.map(e => ({ name: e }))
    });
    
    const webhookId = destRes.data.id;
    const webhookSecret = destRes.data.endpoint_secret_key;
    
    console.log("Created Webhook ID:", webhookId);
    console.log("Webhook Secret Key:", webhookSecret);
    
    // Update functions/.env
    let envFile = fs.readFileSync('functions/.env', 'utf-8');
    // replace PADDLE_WEBHOOK_SECRET=... with the new secret
    if (envFile.includes('PADDLE_WEBHOOK_SECRET=')) {
      envFile = envFile.replace(/PADDLE_WEBHOOK_SECRET=.*/, `PADDLE_WEBHOOK_SECRET=${webhookSecret}`);
    } else {
      envFile += `\nPADDLE_WEBHOOK_SECRET=${webhookSecret}\n`;
    }
    fs.writeFileSync('functions/.env', envFile);
    console.log("Updated functions/.env with Live PADDLE_WEBHOOK_SECRET.");
    
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
