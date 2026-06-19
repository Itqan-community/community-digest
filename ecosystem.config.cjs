module.exports = {
  apps: [{
    name: "digest-server",
    script: "./server.js",
    cwd: "/opt/community-digest",
    interpreter: "node",
    env_file: ".env",
    env: { DIGEST_SERVER: "1" },
    out_file: "/root/.pm2/logs/digest-server-out.log",
    error_file: "/root/.pm2/logs/digest-server-error.log"
  }]
};
