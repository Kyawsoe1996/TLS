// Metro config: lets the app import the shared API contract from ../shared via
// the `@shared/*` tsconfig path alias (Expo's Metro resolver reads tsconfig paths).
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, "../shared");

const config = getDefaultConfig(projectRoot);

// ../shared lives outside the project root, so Metro must watch it explicitly.
config.watchFolders = [...(config.watchFolders ?? []), sharedRoot];

module.exports = config;
