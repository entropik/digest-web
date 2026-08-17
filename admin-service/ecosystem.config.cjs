module.exports = {
  apps: [
    {
      name: "digest-admin",
      script: "dist/src/server.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "768M",
      env: {
        NODE_ENV: "production",
        PORT: "3210",
        PLAYWRIGHT_BROWSERS_PATH: "/home/digest/apps/digest-admin/shared/playwright",
      },
    },
  ],
};
