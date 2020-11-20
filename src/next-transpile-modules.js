const path = require('path');
const enhancedResolve = require('enhanced-resolve');
const pkgUp = require('pkg-up');
const { findRootPackageJsonPath } = require('@kiwicom/monorepo-utils');
const symlinked = require('symlinked');

// Use me when needed
// const util = require('util');
// const inspect = (object) => {
//   console.log(util.inspect(object, { showHidden: false, depth: null }));
// };

const mainPkg = require(pkgUp.sync());
const rootJson = findRootPackageJsonPath();
const rootDirectory = path.dirname(rootJson);
const symlinkedPackages = symlinked.paths(rootDirectory);
const symlinkedPackageLinks = symlinked.links(rootDirectory);
const rootPackageJson = require(rootJson);

/**
 * We create our own Node.js resolver that can ignore symlinks resolution and
 * can support PnP
 */
const resolve = enhancedResolve.create.sync({
  symlinks: false,
});

const mainPackages = Object.keys({
  ...mainPkg.dependencies,
  ...mainPkg.peerDependencies,
  ...rootPackageJson.dependencies,
  ...rootPackageJson.peerDependencies,
}).map((key) => {
  return pkgUp.sync({ cwd: resolve(__dirname, key) });
});

/**
 * Check if two regexes are equal
 * Stolen from https://stackoverflow.com/questions/10776600/testing-for-equality-of-regular-expressions
 *
 * @param {RegExp} x
 * @param {RegExp} y
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
 * Resolve modules to their real paths
 * @param {string[]} modules
 */
const generateResolvedModules = (modules) => {
  const resolvedModules = modules
    .map((module) => {
      let resolved;

      try {
        resolved = resolve(__dirname, module);
      } catch (e) {
        try {
          resolved = resolve(__dirname, path.join(module, 'package.json'));
        } catch (fallbackError) {
          console.error(e);
          console.error(fallbackError);
        }
      }

      if (!resolved)
        throw new Error(
          `next-transpile-modules: could not resolve module "${module}". Are you sure the name of the module you are trying to transpile is correct?`
        );

      return resolved;
    })
    .map(path.dirname);

  return resolvedModules;
};

/**
 * Transpile modules with Next.js Babel configuration
 * @param {string[]} modules
 * @param {{resolveSymlinks?: boolean; unstable_webpack5?: boolean}} options
 */
const withTmInitializer = (modules = [], options = {}) => {
  const withTM = (nextConfig = {}) => {
    if (modules.length === 0) return nextConfig;

    const resolveSymlinks = options.resolveSymlinks || false;
    const isWebpack5 = options.unstable_webpack5 || false;

    const resolvedModules = generateResolvedModules(modules);

    // Generate Webpack condition for the passed modules
    // https://webpack.js.org/configuration/module/#ruleinclude
    const match = (request) =>
      resolvedModules.some((modulePath) => {
        const resolveRequestRoot = path.dirname(pkgUp.sync({ cwd: request }));
        if (resolveRequestRoot.includes(modulePath)) {
          return true;
        }
        const resolvePackageRoot = path.dirname(pkgUp.sync({ cwd: modulePath }));

        if (resolveRequestRoot.includes(resolvePackageRoot)) {
          return true;
        }

        return request.includes(modulePath);
      });

    const unmatch = (request) =>
      resolvedModules.every((modulePath) => {
        const resolveRequestRoot = path.dirname(pkgUp.sync({ cwd: request }));
        if (!resolveRequestRoot.includes(modulePath)) {
          return true;
        }
        const resolvePackageRoot = path.dirname(pkgUp.sync({ cwd: modulePath }));

        if (!resolveRequestRoot.includes(resolvePackageRoot)) {
          return true;
        }

        !request.includes(modulePath);
      });

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

        const hasInclude = (ctx, req) => {
          const test = resolvedModules.some((mod) => {
            // If we the code requires/import an absolute path
            if (!req.startsWith('.')) {
              try {
                const resolved = resolve(__dirname, req);
                console.log(resolved);
                if (!resolved) return false;

                return resolved.includes(mod);
              } catch (err) {
                return false;
              }
            }
            console.log(path.resolve(ctx, req));
            // Otherwise, for relative imports
            return path.resolve(ctx, req).includes(mod);
          });

          return test;
        };

        // Since Next.js 8.1.0, config.externals is undefined
        if (config.externals) {
          config.externals = config.externals.map((external) => {
            if (typeof external !== 'function') return external;

            if (isWebpack5) {
              return ({ context, request }, cb) => {
                return hasInclude(context, request) ? cb() : external({ context, request }, cb);
              };
            }

            return (ctx, req, cb) => {
              return hasInclude(ctx, req) ? cb() : external(ctx, req, cb);
            };
          });
        }

        // Add a rule to include and parse all modules (js & ts)
        if (isWebpack5) {
          config.module.rules.push({
            test: /\.+(js|jsx|mjs|ts|tsx)$/,
            use: options.defaultLoaders.babel,
            include: match,
          });
        } else {
          config.module.rules.push({
            test: /\.+(js|jsx|mjs|ts|tsx)$/,
            loader: options.defaultLoaders.babel,
            include: match,
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
            nextCssLoader.issuer.or = nextCssLoader.issuer.and ? nextCssLoader.issuer.and.concat(match) : match;
            nextCssLoader.issuer.not = [unmatch];
            delete nextCssLoader.issuer.and;
          } else {
            console.warn('next-transpile-modules: could not find default CSS rule, CSS imports may not work');
          }

          if (nextSassLoader) {
            nextSassLoader.issuer.or = nextSassLoader.issuer.and ? nextSassLoader.issuer.and.concat(match) : match;
            nextSassLoader.issuer.not = [unmatch];
            delete nextSassLoader.issuer.and;
          } else {
            console.warn('next-transpile-modules: could not find default SASS rule, SASS imports may not work');
          }
        }

        config.watchOptions.ignored = [
          ...config.watchOptions.ignored.filter((pattern) => pattern !== '**/node_modules/**'),
          `**node_modules/{${modules.map((mod) => `!(${mod})`).join(',')}}/**/*`,
        ];

        if (isWebpack5 && options.dev) {
          // HMR magic
          const checkForTranspiledModules = (currentPath) =>
            modules.find((mod) => {
              return symlinkedPackages.some((sym) => {
                if (currentPath === pkgUp.sync({ cwd: sym })) {
                  return true;
                }
              });
              // not used for right now
              return currentPath.includes(path.dirname(mod)) || currentPath.includes(mod);
            });

          const snapshot = Object.assign({}, config.snapshot);

          const subPackages = resolvedModules.reduce((acc, module) => {
            const pkg = require(path.join(pkgUp.sync({ cwd: module })));
            let allPossibleModules = Object.keys({
              ...pkg.dependencies,
              ...pkg.peerDependencies,
            });
            allPossibleModules = Array.from(new Set([...allPossibleModules]));

            allPossibleModules.forEach((key) => {
              const resolveFrom = path.dirname(pkgUp.sync({ cwd: module }));
              try {
                acc.push(pkgUp.sync({ cwd: resolve(resolveFrom, key) }));
              } catch (e) {
                console.log('error resolving', key);
              }
            });

            return acc;
          }, []);

          const cacheablePackages = Array.from(new Set([...mainPackages, ...subPackages])).filter((i) => {
            return !checkForTranspiledModules(i);
          });

          config.snapshot = Object.assign(snapshot, {
            managedPaths: cacheablePackages,
          });

          config.cache = {
            type: 'memory',
          };
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
