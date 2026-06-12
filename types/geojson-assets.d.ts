// .geojson files are registered as Metro assets (metro.config.js) and resolve
// to an asset module id consumable by expo-asset.
declare module '*.geojson' {
  const assetModuleId: number;
  export default assetModuleId;
}
