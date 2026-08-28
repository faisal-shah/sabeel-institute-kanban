// Expo's default Metro config, with ONE change: the transform cache lives in
// this repo rather than in a directory shared by every Expo project on the
// machine.
//
// This file did not exist before 2026-08-28. Everything else here is delegated
// to `getDefaultConfig`, deliberately — the app built correctly without a config
// at all, so this must not quietly change resolution, watch folders or
// transforms. Adding anything else here is a separate decision.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

/**
 * Keep the transform cache INSIDE this repo.
 *
 * Expo's default is `os.tmpdir()/metro-cache` — one directory shared by every
 * Expo project here. That would be merely wasteful, except that `--clear` does
 * not clear *this project's* entries: Expo's FileStore sees a root inside
 * `os.tmpdir()` and `renameSync`s THE WHOLE DIRECTORY away
 * (`@expo/metro-config/build/file-store.js`). `scripts/e2e.sh` passes `--clear`
 * twice and each one is load-bearing, because `EXPO_PUBLIC_*` is inlined at
 * bundle time and a stale cache serves a bundle built under different env. So
 * the three sibling checkouts were taking turns deleting each other's warm
 * cache, and a Metro already running elsewhere kept writing into shard
 * directories that no longer existed.
 *
 * Set as a FUNCTION, not an array: Metro calls it with the `metro-cache` module
 * (`metro-config/src/loadConfig.js`, `mergeConfigObjects`), so this file does
 * not have to `require('metro-cache')` — a dependency whose version is pinned
 * transitively by `@expo/metro` and would drift from it.
 */
config.cacheStores = ({ FileStore }) => [
  new FileStore({ root: path.resolve(projectRoot, '.metro-cache') }),
];

module.exports = config;
