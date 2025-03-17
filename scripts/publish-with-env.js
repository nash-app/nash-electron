#!/usr/bin/env node

// Load environment variables from .env file
require('dotenv').config();

// Check for GitHub token
const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error('\x1b[31m%s\x1b[0m', 'Error: GITHUB_TOKEN environment variable is not set.');
  console.log('\nTo set up your GitHub token:');
  console.log('1. Go to GitHub.com → Settings → Developer Settings → Personal Access Tokens');
  console.log('2. Generate a new token with "repo" scope');
  console.log('3. Copy the token and add it to your .env file:');
  console.log('\x1b[33m%s\x1b[0m', '   GITHUB_TOKEN=your_token_here');
  console.log('\nOr export it in your terminal:');
  console.log('\x1b[33m%s\x1b[0m', '   export GITHUB_TOKEN=your_token_here');
  console.log('\nThen try publishing again.');
  process.exit(1);
}

console.log('\x1b[32m%s\x1b[0m', '✓ GitHub token verified');

// Check for --dry-run flag
const isDryRun = process.argv.includes('--dry-run');
const args = ['electron-forge', 'publish'];
if (isDryRun) {
  args.push('--dry-run');
  console.log('\x1b[33m%s\x1b[0m', 'Running in dry-run mode (no actual publish will occur)');
}

// Run electron-forge publish with the environment variable set
const { spawn } = require('child_process');
const forge = spawn('npx', args, {
  stdio: 'inherit',
  env: { ...process.env, GITHUB_TOKEN: token }
});

forge.on('exit', (code) => {
  process.exit(code);
}); 