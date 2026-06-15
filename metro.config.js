// Metro config: treat generated facility and graph data as bundled assets
// (loaded via expo-asset).
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts = [...config.resolver.assetExts, 'geojson', 'graphjson'];

// likas/ is a separate reference repository — never bundle from it.
// (Anchored to the absolute subdirectory; a bare /likas/ pattern would also
// match the project root "sanlikas" itself.)
const likasDir = path.resolve(__dirname, 'likas');
const escaped = likasDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
config.resolver.blockList = [new RegExp(`^${escaped}[\\\\/].*`)];

module.exports = config;
