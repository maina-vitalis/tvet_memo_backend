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
  cors: {
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
  },
  azure: {
    communication: {
      connectionString: process.env.AZURE_COMMUNICATION_CONNECTION_STRING,
      senderAddress: process.env.AZURE_EMAIL_SENDER_ADDRESS,
    },
  },
  portal: {
    baseDomain: process.env.PORTAL_BASE_DOMAIN ?? 'tvetmemo.co.ke',
  },
  setupToken: {
    expiryHours: parseInt(process.env.SETUP_TOKEN_EXPIRY_HOURS ?? '72', 10),
  },
  },
});
