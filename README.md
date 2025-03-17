<div align="center">
  <img src="public/icon.png" alt="Nash MCP Logo" width="250" height="250">
</div>

# Nash MCP Electron App

This is a simple Electron application that provides a setup flow for the Nash MCP.

### Prerequisites

- Node.js (v14 or later)
- npm or yarn

### Installation

```bash
# Install dependencies
npm install
# or
yarn install
```

### Running the app

```bash
# Start the app in development mode
npm start
# or
yarn start
```

### Building the app

```bash
# Build the app for production
npm run make
# or
yarn make
```

### Publishing Updates

The app uses Electron's auto-update feature with GitHub releases as the update source. When you publish a new version, users will automatically receive the update.

#### Publishing a New Release

1. Update the version in `package.json`
2. Set up your GitHub token:

   ```bash
   # Add to your .env file
   GITHUB_TOKEN=your_token_here

   # Or export to environment
   export GITHUB_TOKEN=your_token_here
   ```

3. Run the publish command:
   ```bash
   npm run publish
   ```

This will:

- Create a new GitHub release with the version from `package.json`
- Upload the built app for all platforms
- Create a draft release (can be published when ready)

#### Testing Updates

To test the update process before publishing:

1. Enable draft release testing:

   ```bash
   npm run enable-draft-updates
   ```

2. Create a test release with a version number higher than current:

   ```bash
   npm run publish-test
   ```

3. Run the app and it will detect the draft release as an update

4. To check if a publish will work without actually creating a release:
   ```bash
   npm run prerelease-check
   ```

#### Update UI

The app includes a built-in update notification system that shows:

- When updates are available
- Download progress with speed and percentage
- When updates are ready to install
- Any errors during the update process

Users can check for updates manually and choose when to install them.
