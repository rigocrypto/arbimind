module.exports = {
  apps: [
    {
      name: 'arbimind-backend',
      script: 'packages/backend/dist/index.js',
      env: {
        NODE_ENV: 'production',
        ADMIN_KEY: process.env.ADMIN_KEY,
      }
    },
    {
      name: 'arbimind-bot',
      script: 'packages/bot/dist/index.js',
      env: {
        NODE_ENV: 'production',
        AI_SERVICE_KEY: process.env.AI_SERVICE_KEY,
      }
    }
  ]
};
