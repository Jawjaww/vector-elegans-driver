const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Force polling for file watching in Docker
if (process.env.CHOKIDAR_USEPOLLING) {
  config.server = {
    ...config.server,
    useWatchman: false,
  };
  config.watcher = {
    ...config.watcher,
    watchman: {
      deferStates: ['hg.update'],
    },
    useWatchman: false,
    additionalExts: ['mjs', 'cjs'],
  };
}

module.exports = withNativeWind(config, { 
  input: "./global.css",
  configPath: path.resolve(__dirname, "tailwind.config.js")
});
