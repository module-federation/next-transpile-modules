const path = require('path');

const PATH_DELIMITER = '[\\\\/]'; // match 2 antislashes or one slash

// Use me when needed
// const inspect = (object) => {
//   console.log(util.inspect(object, { showHidden: false, depth: null }));
// };

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

const generateIncludes = (modules) => {
  return [
    new RegExp(`(${modules.map(safePath).join('|')})$`),
    new RegExp(`(${modules.map(safePath).join('|')})${PATH_DELIMITER}(?!.*node_modules)`)
  ];
};

const generateExcludes = (modules) => {
  return [
    new RegExp(
      `node_modules${PATH_DELIMITER}(?!(${modules.map(safePath).join('|')})(${PATH_DELIMITER}|$)(?!.*node_modules))`
    )
  ];
};

/**
 * On Windows, the Regex won't match as Webpack tries to resolve the
 * paths of the modules. So we need to check for \\ and /
 */
const safePath = (module) => module.split(/[\\\/]/g).join(PATH_DELIMITER);

/**
 * Actual Next.js plugin
 */
const withTmInitializer = (transpileModules = [], options = {}) => {
  const withTM = (nextConfig = {}) => {
    if (transpileModules.length === 0) return nextConfig;

    const resolveSymlinks = options.resolveSymlinks || false;
    const isWebpack5 = options.unstable_webpack5 || false;

    const includes = generateIncludes(transpileModules);
    const excludes = generateExcludes(transpileModules);
    const hasInclude = (ctx, req) => {
      return includes.find((include) =>
        req.startsWith('.') ? include.test(path.resolve(ctx, req)) : include.test(req)
      );
    };

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

        // Since Next.js 8.1.0, config.externals is undefined
        if (config.externals) {
          config.externals = config.externals.map((external) => {
            if (typeof external !== 'function') return external;

            return isWebpack5
              ? ({ context, request }, cb) => {
                  return hasInclude(context, request) ? cb() : external({ context, request }, cb);
                }
              : (ctx, req, cb) => {
                  return hasInclude(ctx, req) ? cb() : external(ctx, req, cb);
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
            nextCssLoader.issuer.or = nextCssLoader.issuer.and ? nextCssLoader.issuer.and.concat(includes) : includes;
            nextCssLoader.issuer.not = excludes;
            delete nextCssLoader.issuer.and;
          }

          if (nextSassLoader) {
            nextSassLoader.issuer.or = nextSassLoader.issuer.and
              ? nextSassLoader.issuer.and.concat(includes)
              : includes;
            nextSassLoader.issuer.not = excludes;
            delete nextSassLoader.issuer.and;
          }

          // Hack our way to disable errors on node_modules CSS modules
          const nextErrorCssModuleLoader = nextCssLoaders.oneOf.find(
            (rule) =>
              rule.use &&
              rule.use.loader === 'error-loader' &&
              rule.use.options &&
              rule.use.options.reason ===
                'CSS Modules cannot be imported from within node_modules.\n' +
              'Read more: https://err.sh/next.js/css-modules-npm',
          );

          if (nextErrorCssModuleLoader) {
            nextErrorCssModuleLoader.exclude = includes;
          }

          const nextErrorCssGlobalLoader = nextCssLoaders.oneOf.find(
            (rule) =>
              rule.use &&
              rule.use.loader === 'error-loader' &&
              rule.use.options &&
              rule.use.options.reason ===
                'Global CSS cannot be imported from files other than your Custom <App>. Please move all global CSS imports to pages/_app.js. Or convert the import to Component-Level CSS (CSS Modules).\n' +
              'Read more: https://err.sh/next.js/css-global',
          );

          if (nextErrorCssGlobalLoader) {
            nextErrorCssGlobalLoader.exclude = includes;
          }
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
          ? config.watchOptions.ignored.concat(transpileModules)
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
