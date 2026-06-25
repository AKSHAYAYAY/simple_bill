import jwt from 'jsonwebtoken';
import { env } from './src/config/env.js';

const token = jwt.sign({
    user_id: 1,
    email: 'admin@simplebill.com',
    name: 'Admin User',
    default_business_id: 1
}, env.jwt.secret, { expiresIn: '1h' });

console.log(token);
