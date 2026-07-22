const http = require('http');
const https = require('https');

const postData = '';

const options = {
  hostname: 'api-74hnz6mpzq-uc.a.run.app',
  port: 443,
  path: '/api/admin/sync-codes',
  method: 'POST',
  headers: {
    'x-cleanup-secret': 'a1f1ex_cleanup_secret_20260619_sec',
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log('Response:', data);
  });
});

req.on('error', (e) => {
  console.error('Problem with request:', e.message);
});

req.write(postData);
req.end();
