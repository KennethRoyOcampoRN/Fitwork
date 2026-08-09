module.exports = {
  apps: [
    {
      name: "fitwork",
      cwd: "./server",
      script: "dist/index.js",
      env: {
        NODE_ENV: "production",
      },
      autorestart: true,
      max_restarts: 10,
      watch: false,
    },
  ],
};
