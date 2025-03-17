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

// If we get here, the token is present
console.log('\x1b[32m%s\x1b[0m', '✓ GitHub token verified');
process.exit(0); 