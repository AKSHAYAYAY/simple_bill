import dotenv from 'dotenv';

dotenv.config();

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'replace_me_with_very_strong_secret';
}
if (!process.env.JWT_REFRESH_SECRET) {
  process.env.JWT_REFRESH_SECRET = 'replace_me_with_very_strong_refresh_secret';
}

const required = ['MYSQL_HOST', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE'];

for (const key of required) {
  if (!process.env[key]) {
    if (process.env.VERCEL === '1') {
      console.warn(`[Vercel Build Warning] Missing environment variable: ${key}. Ensure this is configured in Vercel settings for runtime.`);
    } else {
      throw new Error(`Missing environment variable: ${key}`);
    }
  }
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  mysql: {
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '7d',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d'
  },
  pythonWorkerUrl: process.env.PYTHON_WORKER_URL || 'http://127.0.0.1:8001'
};
