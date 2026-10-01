export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT!),
  database: {
    url: process.env.DATABASE_URL,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    // [REFRESH TOKENS] Short-lived access token (JWT). Used for actual API authorization.
    // Recommended: 5-15 minutes in production. Clients should proactively refresh.
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    // [REFRESH TOKENS] Long-lived refresh token (opaque). This is what gets revoked on logout.
    // Clients use this to obtain new access tokens without re-entering credentials.
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
    // Legacy alias kept for transition - prefer the specific ones above.
    expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
  },
  platform: {
    adminEmail: process.env.PLATFORM_ADMIN_EMAIL,
    adminPassword: process.env.PLATFORM_ADMIN_PASSWORD,
  },
  cors: {
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
  },
  azure: {
    communicationConnectionString:
      process.env.AZURE_COMMUNICATION_CONNECTION_STRING,
    emailSenderAddress: process.env.AZURE_EMAIL_SENDER_ADDRESS,
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
  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },
  expo: {
    accessToken: process.env.EXPO_ACCESS_TOKEN,
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },
});
