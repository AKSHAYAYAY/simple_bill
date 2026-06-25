import express from 'express';
const app = express();
app.all('/api', (req, res) => res.send('caught by legacy'));
app.use('/api/v1/b/:id/settings', (req, res) => res.send('caught by router'));
app.get('*', (req, res) => res.send('caught by catchall'));

const req = { method: 'GET', url: '/api/v1/b/1/settings' };
const res = { send: (msg) => console.log('RESULT:', msg) };
app.handle(req, res);
