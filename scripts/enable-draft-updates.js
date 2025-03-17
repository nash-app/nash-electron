/**
 * This script updates the .env file to enable testing with draft releases.
 * It allows the auto-updater to download draft releases from GitHub,
 * which is useful for testing the update process before publishing.
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Path to the .env file
const envPath = path.join(__dirname, '..', '.env');

// Check if .env file exists
let envConfig = {};
if (fs.existsSync(envPath)) {
  // Parse existing .env file
  const envFile = fs.readFileSync(envPath, 'utf8');
  envConfig = dotenv.parse(envFile);
}

// Enable draft releases
envConfig.USE_DRAFT_RELEASES = 'true';

// Write the updated .env file
const envContents = Object.entries(envConfig)
  .map(([key, value]) => `${key}=${value}`)
  .join('\n');

fs.writeFileSync(envPath, envContents);

console.log('\x1b[32m%s\x1b[0m', '✓ Draft releases enabled for testing');
console.log('The app will now check for draft releases when looking for updates.');
console.log('This is intended for development/testing purposes only.');
console.log('\nTo disable this feature, set USE_DRAFT_RELEASES=false in your .env file.'); 