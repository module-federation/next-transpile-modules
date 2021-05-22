const path = require('path');
const process = require('process');
const fs = require('fs');

const glob = require('glob');
const enhancedResolve = require('enhanced-resolve');
const escalade = require('escalade/sync');

// Use me when needed
// const util = require('util');
// const inspect = (object) => {
//   console.log(util.inspect(object, { showHidden: false, depth: null }));
// };

let MEMOIZED_PATH = null;

/**
 * It tries to find root package.json recursively starting from the
 * provided path. It expects monorepo setup (defined workspaces). It
 * also memoizes the computed path and returns it immediately with
 * the second call.
 */
function findRootPackageJson(directory = __dirname) {
  const packageJsonPath = findRootPackageJsonPath(directory);
  return require(packageJsonPath);
}

function findMonorepoRoot(directory = __dirname) {
  return path.dirname(findRootPackageJsonPath(directory));
}

function findRootPackageJsonPath(directory = __dirname) {
  if (MEMOIZED_PATH !== null) {
    return MEMOIZED_PATH;
  }

  if (directory === '/') {
    throw new Error('Unable to find root package.json file.');
  }

  const packageJSONPath = path.join(directory, 'package.json');

  try {
    fs.accessSync(packageJSONPath, fs.constants.F_OK);
    // $FlowAllowDynamicImport
    const packageJSON = require(packageJSONPath);
    if (!packageJSON.workspaces) {
      // not a root package.json
      return findRootPackageJsonPath(path.dirname(directory));
    }
    MEMOIZED_PATH = packageJSONPath;
    return packageJSONPath;
  } catch (err) {
    // package.json doesn't exist here
    return findRootPackageJsonPath(path.dirname(directory));
  }
}

const CWD = process.cwd();

/**
 * Our own Node.js resolver that can ignore symlinks resolution and  can support
 * PnP
 */
const resolve = enhancedResolve.create.sync({
  symlinks: false,
  extensions: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.css', '.scss', '.sass'],
  mainFields: ['main', 'module', 'source'],
  // Is it right? https://github.com/webpack/enhanced-resolve/issues/283#issuecomment-775162497
  conditionNames: ['require'],
});

/**
 * Check if two regexes are equal
 * Stolen from https://stackoverflow.com/questions/10776600/testing-for-equality-of-regular-expressions
 *
 * @param {RegExp} x
 * @param {RegExp} y
 * @returns {boolean}
 */
const regexEqual = (x, y) => {
  return (
    x instanceof RegExp &&
    y instanceof RegExp &&
    x.source === y.source &&
    x.global === y.global &&
    x.ignoreCase === y.ignoreCase &&
    x.multiline === y.multiline
  );
};

/**
 * Return the root path (package.json directory) of a given module
 * @param {string} module
 * @returns {string}
 */
const getPackageRootDirectory = (module) => {
  let packageDirectory;
  let packageRootDirectory;

  try {
    // Get the module path
    packageDirectory = resolve(CWD, module);

    if (!packageDirectory) {
      throw new Error(
        `next-transpile-modules - could not resolve module "${module}". Are you sure the name of the module you are trying to transpile is correct?`
      );
    }

    // Get the location of its package.json
    const pkgPath = escalade(packageDirectory, (dir, names) => {
      if (names.includes('package.json')) {
        return 'package.json';
      }
      return false;
    });
    if (pkgPath == null) {
      throw new Error(
        `next-transpile-modules - an error happened when trying to get the root directory of "${module}". Is it missing a package.json?\n${err}`
      );
    }
    packageRootDirectory = path.dirname(pkgPath);
  } catch (err) {
    throw new Error(`next-transpile-modules - an unexpected error happened when trying to resolve "${module}"\n${err}`);
  }

  return packageRootDirectory;
};

/**
 * Resolve modules to their real paths
 * @param {string[]} modules
 * @returns {string[]}
 */
const generateModulesPaths = (modules) => {
  const packagesPaths = modules.map(getPackageRootDirectory);

  return packagesPaths;
};

/**
 * Logger for the debug mode
 * @param {boolean} enable enable the logger or not
 * @returns {(message: string, force: boolean) => void}
 */
const createLogger = (enable) => {
  return (message, force) => {
    if (enable || force) console.info(`next-transpile-modules - ${message}`);
  };
};

/**
 * Matcher function for webpack to decide which modules to transpile
 * @param {string[]} modulesToTranspile
 * @param {function} logger
 * @returns {(path: string) => boolean}
 */
const createWebpackMatcher = (modulesToTranspile, logger = createLogger(false)) => {
  return (filePath) => {
    const isNestedNodeModules = (filePath.match(/node_modules/g) || []).length > 1;

    if (isNestedNodeModules) {
      return false;
    }

    return modulesToTranspile.some((modulePath) => {
      const transpiled = filePath.startsWith(modulePath);
      if (transpiled) logger(`transpiled: ${filePath}`);
      return transpiled;
    });
  };
};

/**
 * Transpile modules with Next.js Babel configuration
 * @param {string[]} modules
 * @param {{resolveSymlinks?: boolean, debug?: boolean, __unstable_matcher: (path: string) => boolean}} options
 */
const withTmInitializer = (modules = [], options = {}) => {
  const withTM = (nextConfig = {}) => {
    if (modules.length === 0) return nextConfig;

    const resolveSymlinks = options.resolveSymlinks || false;
    const isWebpack5 = (nextConfig.future && nextConfig.future.webpack5) || false;
    const resolveFromRoot = options.resolveFromRoot || false;
    const debug = options.debug || false;

    const logger = createLogger(debug);

    const modulesPaths = generateModulesPaths(modules);

    if (isWebpack5) logger(`WARNING experimental Webpack 5 support enabled`, true);

    logger(`the following paths will get transpiled:\n${modulesPaths.map((mod) => `  - ${mod}`).join('\n')}`);

    // Generate Webpack condition for the passed modules
    // https://webpack.js.org/configuration/module/#ruleinclude
    const matcher = options.__unstable_matcher || createWebpackMatcher(modulesPaths, logger);

    return Object.assign({}, nextConfig, {
      webpack(config, options) {
        // Safecheck for Next < 5.0
        if (!options.defaultLoaders) {
          throw new Error(
            'This plugin is not compatible with Next.js versions below 5.0.0 https://err.sh/next-plugins/upgrade'
          );
        }

        // Avoid Webpack to resolve transpiled modules path to their real path as
        // we want to test modules from node_modules only. If it was enabled,
        // modules in node_modules installed via symlink would then not be
        // transpiled.
        config.resolve.symlinks = resolveSymlinks;

        const hasInclude = (context, request) => {
          const test = modulesPaths.some((mod) => {
            // If we the code requires/import an absolute path
            if (!request.startsWith('.')) {
              try {
                const moduleDirectory = getPackageRootDirectory(request);

                if (!moduleDirectory) return false;

                return moduleDirectory.includes(mod);
              } catch (err) {
                return false;
              }
            }

            // Otherwise, for relative imports
            return path.resolve(context, request).includes(mod);
          });

          return test;
        };

        // Since Next.js 8.1.0, config.externals is undefined
        if (config.externals) {
          config.externals = config.externals.map((external) => {
            if (typeof external !== 'function') return external;

            if (isWebpack5) {
              return async ({ context, request, getResolve }) => {
                if (hasInclude(context, request)) return;
                return external({ context, request, getResolve });
              };
            }

            return (context, request, cb) => {
              return hasInclude(context, request) ? cb() : external(context, request, cb);
            };
          });
        }

        // Add a rule to include and parse all modules (js & ts)
        if (isWebpack5) {
          config.module.rules.push({
            test: /\.+(js|jsx|mjs|ts|tsx)$/,
            use: options.defaultLoaders.babel,
            include: matcher,
          });

          // IMPROVE ME: we are losing all the cache on node_modules, which is terrible
          // The problem is managedPaths does not allow to isolate specific specific folders
          config.snapshot = Object.assign(config.snapshot || {}, {
            managedPaths: [],
          });
        } else {
          config.module.rules.push({
            test: /\.+(js|jsx|mjs|ts|tsx)$/,
            loader: options.defaultLoaders.babel,
            include: matcher,
          });
        }

        // Support CSS modules + global in node_modules
        // TODO ask Next.js maintainer to expose the css-loader via defaultLoaders
        const nextCssLoaders = config.module.rules.find((rule) => typeof rule.oneOf === 'object');

        // .module.css
        if (nextCssLoaders) {
          const nextCssLoader = nextCssLoaders.oneOf.find(
            (rule) => rule.sideEffects === false && regexEqual(rule.test, /\.module\.css$/)
          );

          const nextSassLoader = nextCssLoaders.oneOf.find(
            (rule) => rule.sideEffects === false && regexEqual(rule.test, /\.module\.(scss|sass)$/)
          );

          if (nextCssLoader) {
            nextCssLoader.issuer.or = nextCssLoader.issuer.and ? nextCssLoader.issuer.and.concat(matcher) : matcher;
            delete nextCssLoader.issuer.not;
            delete nextCssLoader.issuer.and;
          } else {
            console.warn('next-transpile-modules - could not find default CSS rule, CSS imports may not work');
          }

          if (nextSassLoader) {
            nextSassLoader.issuer.or = nextSassLoader.issuer.and ? nextSassLoader.issuer.and.concat(matcher) : matcher;
            delete nextSassLoader.issuer.not;
            delete nextSassLoader.issuer.and;
          } else {
            console.warn('next-transpile-modules - could not find default SASS rule, SASS imports may not work');
          }
        }

        // Make hot reloading work!
        // FIXME: not working on Wepback 5
        // https://github.com/vercel/next.js/issues/13039
        config.watchOptions.ignored = [
          ...config.watchOptions.ignored.filter((pattern) => pattern !== '**/node_modules/**'),
          `**node_modules/{${modules.map((mod) => `!(${mod})`).join(',')}}/**/*`,
        ];

        if (isWebpack5 && options.dev) {
          const transpiledModuleDeps = modulesPaths.map((modulePath) => {
            return path.join(modulePath, 'node_modules');
          });

          const workingDirectory = resolveFromRoot ? path.dirname(findRootPackageJsonPath(CWD)) : CWD;
          const globbedFiles = glob.sync('**/node_modules/', { cwd: workingDirectory, nosort: true, absolute: true });
          let rootNodeModules = [];

          if (fs.existsSync(path.join(workingDirectory, 'node_modules'))) {
            rootNodeModules = glob.sync('*/package.json', {
              cwd: path.join(workingDirectory, 'node_modules'),
              nosort: true,
              absolute: true,
            });
          }
          const managedPathsSet = new Set([...globbedFiles, ...rootNodeModules]);
          const managedPaths = Array.from(managedPathsSet).filter((i) => {
            return transpiledModuleDeps.some((transpiledPath) => {
              return !transpiledPath.includes(i);
            });
          });
          // HMR magic
          // const checkForTranspiledModules = (currentPath) =>
          //   modules.find((mod) => {
          //     return symlinkedPackages.some((sym) => {
          //       if (currentPath === pkgUp.sync({ cwd: sym })) {
          //         return true;
          //       }
          //     });
          //     // not used for right now
          //     return currentPath.includes(path.dirname(mod)) || currentPath.includes(mod);
          //   });

          const snapshot = Object.assign({}, config.snapshot);
          //
          // const subPackages = resolvedModules.reduce((acc, module) => {
          //   const pkg = require(path.join(pkgUp.sync({ cwd: module })));
          //   let allPossibleModules = Object.keys({
          //     ...pkg.dependencies,
          //     ...pkg.peerDependencies,
          //   });
          //   allPossibleModules = Array.from(new Set([...allPossibleModules]));
          //
          //   allPossibleModules.forEach((key) => {
          //     const resolveFrom = path.dirname(pkgUp.sync({ cwd: module }));
          //     try {
          //       acc.push(pkgUp.sync({ cwd: resolve(resolveFrom, key) }));
          //     } catch (e) {
          //       try {
          //         console.log(pkgUp.sync({ cwd: path.dirname(resolve(resolveFrom, path.join(key,'package.json'))) }))
          //       } catch (e) {
          //         console.log('error resolving', key);
          //       }
          //     }
          //   });
          //
          //   return acc;
          // }, []);
          //
          // const cacheablePackages = Array.from(new Set([...mainPackages, ...subPackages])).filter((i) => {
          //   return !checkForTranspiledModules(i);
          // });
          config.snapshot = Object.assign(snapshot, {
            managedPaths: managedPaths,
          });
          //
          // config.cache = {
          //   type: 'memory',
          // };
        }
        // Overload the Webpack config if it was already overloaded
        if (typeof nextConfig.webpack === 'function') {
          return nextConfig.webpack(config, options);
        }

        return config;
      },
    });
  };

  return withTM;
};

module.exports = withTmInitializer;
