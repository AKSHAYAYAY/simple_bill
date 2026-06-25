const express = require('express');
const app = express();

app.all('/api', (req, res) => {
  console.log('CAUGHT BY /api');
  res.send('legacy');
});

app.use('/api/v1', (req, res) => {
  console.log('CAUGHT BY /api/v1');
  res.send('v1');
});

const req = { method: 'GET', url: '/api/v1/foo', headers: {} };
const res = { 
  send: (msg) => console.log('RES:', msg),
  status: () => res,
  setHeader: () => {},
  end: () => {}
};

app.handle(req, res);
