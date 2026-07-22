const fs = require('fs');

const API_KEY = process.env.PADDLE_API_KEY || 'pdl_live_apikey_01kxgvngw52jb6tk8vb386xvqr_c3jywNeShgA4rjkSmYTz4M_AbY';
const BASE_URL = 'https://api.paddle.com';

async function fetchPaddle(endpoint, method = 'GET', body = null) {
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
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
    console.log("Creating Product 'Smart Accountant Premium'...");
    const prodRes = await fetchPaddle('/products', 'POST', {
      name: 'Smart Accountant Premium',
      tax_category: 'saas',
      description: 'Premium access to AIFLEX Smart Accountant ERP'
    });
    const productId = prodRes.data.id;
    console.log("Created Product ID:", productId);

    console.log("Creating Base Price ($100/yr)...");
    const basePriceRes = await fetchPaddle('/prices', 'POST', {
      product_id: productId,
      description: 'Annual Subscription',
      unit_price: {
        amount: '10000',
        currency_code: 'USD'
      },
      billing_cycle: {
        interval: 'year',
        frequency: 1
      },
      quantity: {
        minimum: 1,
        maximum: 999
      },
      tax_mode: 'account_setting'
    });
    const basePriceId = basePriceRes.data.id;
    console.log("Created Base Price ID:", basePriceId);

    console.log("Creating Extra Company Seat Price ($20/yr)...");
    const extraPriceRes = await fetchPaddle('/prices', 'POST', {
      product_id: productId,
      description: 'Extra Company Seat',
      unit_price: {
        amount: '2000',
        currency_code: 'USD'
      },
      billing_cycle: {
        interval: 'year',
        frequency: 1
      },
      quantity: {
        minimum: 1,
        maximum: 999
      },
      tax_mode: 'account_setting'
    });
    const extraPriceId = extraPriceRes.data.id;
    console.log("Created Extra Price ID:", extraPriceId);
    
    // Update .env.production
    let envFile = fs.readFileSync('.env.production', 'utf-8');
    envFile = envFile.replace(/VITE_PADDLE_BASE_PRICE_ID=.*/, `VITE_PADDLE_BASE_PRICE_ID=${basePriceId}`);
    envFile = envFile.replace(/VITE_PADDLE_EXTRA_COMPANY_PRICE_ID=.*/, `VITE_PADDLE_EXTRA_COMPANY_PRICE_ID=${extraPriceId}`);
    fs.writeFileSync('.env.production', envFile);
    console.log("Updated .env.production with new Live Price IDs.");
    
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
