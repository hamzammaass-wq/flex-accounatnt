import fs from 'fs';
import path from 'path';

const API_KEY = 'pdl_sdbx_apikey_01ktxwkv540r73ph10mjxq8f4d_92wdNgXvaR6dTQAzaRHdgn_AbA';
const BASE_URL = 'https://sandbox-api.paddle.com';

const headers = {
  'Authorization': `Bearer ${API_KEY}`,
  'Content-Type': 'application/json',
  'Paddle-Version': '1'
};

async function run() {
  console.log('--- Starting Paddle Sandbox Auto-Configuration ---');

  try {
    // 1. Create or Find Product
    console.log('1. Fetching existing products...');
    const prodListRes = await fetch(`${BASE_URL}/products`, { headers });
    if (!prodListRes.ok) {
      throw new Error(`Failed to list products: ${prodListRes.status} ${await prodListRes.text()}`);
    }
    const prodListData = await prodListRes.json();
    let product = prodListData.data?.find(p => p.name === 'Smart Accountant Premium' || p.name === 'المحاسب الذكي');
    
    if (product) {
      console.log(`Found existing product: ${product.name} (${product.id})`);
    } else {
      console.log('Creating new product: "Smart Accountant Premium"...');
      const prodRes = await fetch(`${BASE_URL}/products`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: 'Smart Accountant Premium',
          tax_category: 'saas',
          description: 'Premium access to AIFLEX Smart Accountant ERP'
        })
      });
      if (!prodRes.ok) {
        throw new Error(`Failed to create product: ${prodRes.status} ${await prodRes.text()}`);
      }
      const prodData = await prodRes.json();
      product = prodData.data;
      console.log(`Product created: ${product.name} (${product.id})`);
    }

    const productId = product.id;

    // 2. Create or Find Prices
    console.log('2. Fetching existing prices...');
    const priceListRes = await fetch(`${BASE_URL}/prices?product_id=${productId}`, { headers });
    if (!priceListRes.ok) {
      throw new Error(`Failed to list prices: ${priceListRes.status} ${await priceListRes.text()}`);
    }
    const priceListData = await priceListRes.json();
    
    // Look for base price ($40 USD yearly) and extra price ($10 USD yearly)
    let basePrice = priceListData.data?.find(p => 
      p.billing_cycle?.interval === 'year' && 
      p.billing_cycle?.frequency === 1 && 
      p.unit_price?.amount === '4000'
    );
    let extraPrice = priceListData.data?.find(p => 
      p.billing_cycle?.interval === 'year' && 
      p.billing_cycle?.frequency === 1 && 
      p.unit_price?.amount === '1000'
    );

    if (basePrice) {
      console.log(`Found existing base price: ${basePrice.id} ($40 USD/year)`);
    } else {
      console.log('Creating base price ($40 USD/year)...');
      const basePriceRes = await fetch(`${BASE_URL}/prices`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          product_id: productId,
          name: 'Annual Subscription',
          description: 'Base subscription for the first company',
          billing_cycle: {
            interval: 'year',
            frequency: 1
          },
          unit_price: {
            amount: '4000',
            currency_code: 'USD'
          }
        })
      });
      if (!basePriceRes.ok) {
        throw new Error(`Failed to create base price: ${basePriceRes.status} ${await basePriceRes.text()}`);
      }
      const basePriceData = await basePriceRes.json();
      basePrice = basePriceData.data;
      console.log(`Base price created: ${basePrice.id}`);
    }

    if (extraPrice) {
      console.log(`Found existing extra price: ${extraPrice.id} ($10 USD/year)`);
    } else {
      console.log('Creating extra company seat price ($10 USD/year)...');
      const extraPriceRes = await fetch(`${BASE_URL}/prices`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          product_id: productId,
          name: 'Extra Company Seat',
          description: 'Extra company subscription seat',
          billing_cycle: {
            interval: 'year',
            frequency: 1
          },
          unit_price: {
            amount: '1000',
            currency_code: 'USD'
          }
        })
      });
      if (!extraPriceRes.ok) {
        throw new Error(`Failed to create extra price: ${extraPriceRes.status} ${await extraPriceRes.text()}`);
      }
      const extraPriceData = await extraPriceRes.json();
      extraPrice = extraPriceData.data;
      console.log(`Extra price created: ${extraPrice.id}`);
    }

    // 3. Create Client Token
    console.log('3. Creating client-side token for Paddle.js...');
    const clientTokenRes = await fetch(`${BASE_URL}/client-tokens`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'Local Sandbox Client Token',
        description: 'Token for local web application sandbox development'
      })
    });
    if (!clientTokenRes.ok) {
      throw new Error(`Failed to create client token: ${clientTokenRes.status} ${await clientTokenRes.text()}`);
    }
    const clientTokenData = await clientTokenRes.json();
    const clientToken = clientTokenData.data.client_token;
    console.log(`Client Token created: ${clientToken}`);

    // 4. Update configuration files
    console.log('4. Updating .env files...');
    
    // A. Update .env.local
    const envLocalPath = path.resolve('.env.local');
    let envLocalContent = '';
    if (fs.existsSync(envLocalPath)) {
      envLocalContent = fs.readFileSync(envLocalPath, 'utf8');
    }
    
    const envLocalLines = envLocalContent.split(/\r?\n/);
    const updatedLocalLines = [];
    const keysToUpdate = {
      VITE_PADDLE_CLIENT_TOKEN: clientToken,
      VITE_PADDLE_BASE_PRICE_ID: basePrice.id,
      VITE_PADDLE_EXTRA_PRICE_ID: extraPrice.id,
      VITE_PADDLE_ENVIRONMENT: 'sandbox',
      VITE_ENABLE_STORE_BILLING: 'true'
    };
    
    const processedKeys = new Set();
    
    for (const line of envLocalLines) {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        if (keysToUpdate.hasOwnProperty(key)) {
          updatedLocalLines.push(`${key}=${keysToUpdate[key]}`);
          processedKeys.add(key);
        } else {
          updatedLocalLines.push(line);
        }
      } else {
        updatedLocalLines.push(line);
      }
    }
    
    for (const [key, value] of Object.entries(keysToUpdate)) {
      if (!processedKeys.has(key)) {
        updatedLocalLines.push(`${key}=${value}`);
      }
    }
    
    fs.writeFileSync(envLocalPath, updatedLocalLines.join('\n'), 'utf8');
    console.log('Updated .env.local successfully.');

    // B. Update backend/.env
    const backendEnvPath = path.resolve('backend/.env');
    if (fs.existsSync(backendEnvPath)) {
      let backendEnvContent = fs.readFileSync(backendEnvPath, 'utf8');
      const backendLines = backendEnvContent.split(/\r?\n/);
      const updatedBackendLines = [];
      let apiKeyUpdated = false;
      for (const line of backendLines) {
        if (line.startsWith('PADDLE_API_KEY=')) {
          updatedBackendLines.push(`PADDLE_API_KEY=${API_KEY}`);
          apiKeyUpdated = true;
        } else {
          updatedBackendLines.push(line);
        }
      }
      if (!apiKeyUpdated) {
        updatedBackendLines.push(`PADDLE_API_KEY=${API_KEY}`);
      }
      fs.writeFileSync(backendEnvPath, updatedBackendLines.join('\n'), 'utf8');
      console.log('Updated backend/.env successfully.');
    }

    // C. Update functions/.env
    const functionsEnvPath = path.resolve('functions/.env');
    if (fs.existsSync(functionsEnvPath)) {
      let functionsEnvContent = fs.readFileSync(functionsEnvPath, 'utf8');
      const functionsLines = functionsEnvContent.split(/\r?\n/);
      const updatedFunctionsLines = [];
      let apiKeyUpdated = false;
      for (const line of functionsLines) {
        if (line.startsWith('PADDLE_API_KEY=')) {
          updatedFunctionsLines.push(`PADDLE_API_KEY=${API_KEY}`);
          apiKeyUpdated = true;
        } else {
          updatedFunctionsLines.push(line);
        }
      }
      if (!apiKeyUpdated) {
        updatedFunctionsLines.push(`PADDLE_API_KEY=${API_KEY}`);
      }
      fs.writeFileSync(functionsEnvPath, updatedFunctionsLines.join('\n'), 'utf8');
      console.log('Updated functions/.env successfully.');
    }

    console.log('\n--- PADDLE SANDBOX INTEGRATION COMPLETE ---');
    console.log(`Environment: sandbox`);
    console.log(`Product: Smart Accountant Premium (${productId})`);
    console.log(`Base Price (First Company): ${basePrice.id} ($40 USD/year)`);
    console.log(`Extra Price (Per Extra Company): ${extraPrice.id} ($10 USD/year)`);
    console.log(`Client Token: ${clientToken}`);
    console.log('-------------------------------------------');
    console.log('Next Steps: Restart your local Vite dev server for the new variables to take effect!');

  } catch (error) {
    console.error('Error during setup:', error);
  }
}

run();
