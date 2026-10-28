// ecosystem.config.cjs — PM2 process manager config
// Run: pm2 start ecosystem.config.cjs
// Boot: pm2 startup && pm2 save

module.exports = {
  apps: [
    {
      name: 'orchestrator',
      script: './orchestrator/index.js',
      cwd: __dirname,
      watch: false,
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: '../obsidian/Logs/orchestrator.log',
      error_file: '../obsidian/Logs/orchestrator-error.log'
    },
    {
      name: 'life-admin',
      script: './life-admin/index.js',
      cwd: __dirname,
      watch: false,
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        PORT: 3002
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: '../obsidian/Logs/life-admin.log',
      error_file: '../obsidian/Logs/life-admin-error.log'
    },
    {
      name: 'fitness',
      script: './fitness/index.js',
      cwd: __dirname,
      watch: false,
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        PORT: 3003
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: '../obsidian/Logs/fitness.log',
      error_file: '../obsidian/Logs/fitness-error.log'
    },
    {
      name: 'learning',
      script: './learning/index.js',
      cwd: __dirname,
      watch: false,
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        PORT: 3004
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: '../obsidian/Logs/learning.log',
      error_file: '../obsidian/Logs/learning-error.log'
    },
    {
      name: 'memory',
      script: './memory/index.js',
      cwd: __dirname,
      watch: false,
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        PORT: 3005
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: '../obsidian/Logs/memory.log',
      error_file: '../obsidian/Logs/memory-error.log'
    },
    {
      name: 'vault-manager',
      script: './vault-manager/index.js',
      cwd: __dirname,
      watch: false,
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        PORT: 3006
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: '../obsidian/Logs/vault-manager.log',
      error_file: '../obsidian/Logs/vault-manager-error.log'
    },
    {
      name: 'researcher',
      script: './researcher/index.js',
      cwd: __dirname,
      watch: false,
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        PORT: 3007
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: '../obsidian/Logs/researcher.log',
      error_file: '../obsidian/Logs/researcher-error.log'
    },
    {
      name: 'builder',
      script: './builder/index.js',
      cwd: __dirname,
      watch: false,
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        PORT: 3008
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: '../obsidian/Logs/builder.log',
      error_file: '../obsidian/Logs/builder-error.log'
    },
    {
      name: 'business-expert',
      script: './business-expert/index.js',
      cwd: __dirname,
      watch: false,
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        PORT: 3009
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: '../obsidian/Logs/business-expert.log',
      error_file: '../obsidian/Logs/business-expert-error.log'
    },
    {
      name: 'manufacturing-expert',
      script: './manufacturing-expert/index.js',
      cwd: __dirname,
      watch: false,
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        PORT: 3010
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: '../obsidian/Logs/manufacturing-expert.log',
      error_file: '../obsidian/Logs/manufacturing-expert-error.log'
    },
    {
      name: 'career-expert',
      script: './career-expert/index.js',
      cwd: __dirname,
      watch: false,
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        PORT: 3011
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: '../obsidian/Logs/career-expert.log',
      error_file: '../obsidian/Logs/career-expert-error.log'
    },
    {
      name: 'network-security',
      script: './network-security/index.js',
      cwd: __dirname,
      watch: false,
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        PORT: 3012
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: '../obsidian/Logs/network-security.log',
      error_file: '../obsidian/Logs/network-security-error.log'
    },
    {
      name: 'it-security',
      script: './it-security/index.js',
      cwd: __dirname,
      watch: false,
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        PORT: 3013
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: '../obsidian/Logs/it-security.log',
      error_file: '../obsidian/Logs/it-security-error.log'
    },
    {
      name: 'maintenance',
      script: './maintenance/index.js',
      cwd: __dirname,
      watch: false,
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        PORT: 3014
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: '../obsidian/Logs/maintenance.log',
      error_file: '../obsidian/Logs/maintenance-error.log'
    },
    {
      name: 'offline-llm',
      script: './offline-llm/index.js',
      cwd: __dirname,
      watch: false,
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        PORT: 3015
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: '../obsidian/Logs/offline-llm.log',
      error_file: '../obsidian/Logs/offline-llm-error.log'
    }
  ]
}
