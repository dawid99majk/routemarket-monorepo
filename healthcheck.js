import http from 'node:http';

const options = {
  hostname: 'localhost',
  port: process.env.ATLAS_API_PORT || 8787,
  path: '/health',
  method: 'GET',
  timeout: 2000
};

const req = http.request(options, (res) => {
  if (res.statusCode === 200) {
    process.exit(0);
  } else {
    console.error('Healthcheck failed with status:', res.statusCode);
    process.exit(1);
  }
});

req.on('error', (err) => {
  console.error('Healthcheck request failed:', err.message);
  process.exit(1);
});

req.end();
