// ecosystem.config.js (root)
module.exports = {
  apps: [
    {
      name: 'arbimind-bot',
      cwd: 'packages/bot',
      script: 'dist/index.js',
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 5,
      min_uptime: '10s',
    },
    {
      name: 'arbimind-backend',
      cwd: 'packages/backend',
      script: 'dist/index.js',
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
      instances: 1,
      exec_mode: 'fork',
    },
  ],
};
