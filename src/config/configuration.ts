export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  database: {
    url: process.env.DATABASE_URL,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  },
  platform: {
    adminEmail: process.env.PLATFORM_ADMIN_EMAIL,
    adminPassword: process.env.PLATFORM_ADMIN_PASSWORD,
  },
  cors: {
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
  },
});
