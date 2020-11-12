const path = require('path');
const process = require('process');

const enhancedResolve = require('enhanced-resolve');
const escalade = require('escalade/sync');

// Use me when needed
// const inspect = (object) => {
//   console.log(util.inspect(object, { showHidden: false, depth: null }));
// };

const CWD = process.cwd();

/**
 * Our own Node.js resolver that can ignore symlinks resolution and  can support
 * PnP
 */
const resolve = enhancedResolve.create.sync({
  symlinks: false,
  extensions: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.css', '.scss', '.sass'],
  mainFields: ['main', 'source'],
});

/**
 * Stolen from https://stackoverflow.com/questions/10776600/testing-for-equality-of-regular-expressions
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
 */
const generateModulesPaths = (modules) => {
  const packagesPaths = modules.map(getPackageRootDirectory);

  return packagesPaths;
};

/**
 * Logger for the debug mode
 */
const createLogger = (enable) => {
  return (message, force) => {
    if (enable || force) console.info(`next-transpile-modules - ${message}`);
  };
};

/**
 * Transpile modules with Next.js Babel configuration
 * @param {string[]} modules
 * @param {{resolveSymlinks?: boolean; debug?: boolean, unstable_webpack5?: boolean}} options
 */
const withTmInitializer = (transpileModules = [], options = {}) => {
  const withTM = (nextConfig = {}) => {
    if (transpileModules.length === 0) return nextConfig;

    const resolveSymlinks = options.resolveSymlinks || false;
    const isWebpack5 = options.unstable_webpack5 || false;
    const debug = options.debug || false;

    const logger = createLogger(debug);

    const modulesPaths = generateModulesPaths(modules);

    if (isWebpack5) logger(`WARNING experimental Webpack 5 support enabled`, true);

    logger(`the following paths will get transpiled:\n${modulesPaths.map((mod) => `  - ${mod}`).join('\n')}`);

    // Generate Webpack condition for the passed modules
    // https://webpack.js.org/configuration/module/#ruleinclude
    const match = (path) =>
      modulesPaths.some((modulePath) => {
        const transpiled = path.includes(modulePath);
        if (transpiled) logger(`transpiled: ${path}`);
        return transpiled;
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
              return ({ context, request }, cb) => {
                return hasInclude(context, request) ? cb() : external({ context, request }, cb);
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
            include: includes
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
            include: includes
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
            delete nextCssLoader.issuer.not;
            delete nextCssLoader.issuer.and;
          } else {
            console.warn('next-transpile-modules - could not find default CSS rule, CSS imports may not work');
          }

          if (nextSassLoader) {
            nextSassLoader.issuer.or = nextSassLoader.issuer.and ? nextSassLoader.issuer.and.concat(match) : match;
            delete nextSassLoader.issuer.not;
            delete nextSassLoader.issuer.and;
          } else {
            console.warn('next-transpile-modules - could not find default SASS rule, SASS imports may not work');
          }

          // Hack our way to disable errors on node_modules CSS modules
          const nextErrorCssModuleLoader = nextCssLoaders.oneOf.find(
            (rule) =>
              rule.use &&
              rule.use.loader === 'error-loader' &&
              rule.use.options &&
              (rule.use.options.reason ===
                'CSS Modules \u001b[1mcannot\u001b[22m be imported from within \u001b[1mnode_modules\u001b[22m.\n' +
                  'Read more: https://err.sh/next.js/css-modules-npm' ||
                rule.use.options.reason ===
                  'CSS Modules cannot be imported from within node_modules.\nRead more: https://err.sh/next.js/css-modules-npm')
          );

          if (nextErrorCssModuleLoader) {
            nextErrorCssModuleLoader.exclude = includes;
          }

        // Make hot reloading work!
        // FIXME: not working on Wepback 5
        // https://github.com/vercel/next.js/issues/13039
        config.watchOptions.ignored = [
          ...config.watchOptions.ignored.filter((pattern) => pattern !== '**/node_modules/**'),
          `**node_modules/{${modules.map((mod) => `!(${mod})`).join(',')}}/**/*`,
        ];

        if (isWebpack5) {
          const managed = transpileModules.reduce((acc, mod) => {
            try {
              // tests dont have valid package.json field to resolve modules
              acc.push(path.dirname(require.resolve(mod)));
            } catch (e) {
              // acc.push(mod)
              const foundPackage = require.main.paths.find((resoluionPath) => {
                return fs.existsSync(path.join(resoluionPath, mod));
              });
              acc.push(path.join(foundPackage, mod));
              if (!foundPackage) {
                console.warn('Unable to resolve module', mod);
              }
            }
            return acc;
          }, []);

          config.cache = {
            type: 'filesystem',
            managedPaths: managed
          };
        }
        // Overload the Webpack config if it was already overloaded
        if (typeof nextConfig.webpack === 'function') {
          return nextConfig.webpack(config, options);
        }

        return config;
      },

      // webpackDevMiddleware needs to be told to watch the changes in the
      // transpiled modules directories
      webpackDevMiddleware(config) {
        // Replace /node_modules/ by the new exclude RegExp (including the modules
        // that are going to be transpiled)
        // https://github.com/zeit/next.js/blob/815f2e91386a0cd046c63cbec06e4666cff85971/packages/next/server/hot-reloader.js#L335

        const ignored = isWebpack5
          ? config.watchOptions.ignored
              .concat(transpileModules.map((i) => '**/node_modules/!(' + i + ')*/**'))
              .filter((i) => i !== '**/node_modules/**')
          : config.watchOptions.ignored
              .filter((pattern) => !regexEqual(pattern, /[\\/]node_modules[\\/]/) && pattern !== '**/node_modules/**')
              .concat(excludes);

        config.watchOptions.ignored = ignored;

        if (typeof nextConfig.webpackDevMiddleware === 'function') {
          return nextConfig.webpackDevMiddleware(config);
        }

        return config;
      }
    });
  };

  return withTM;
};

module.exports = withTmInitializer;
