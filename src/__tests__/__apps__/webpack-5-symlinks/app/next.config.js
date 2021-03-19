const withTM = require('./next-transpile-modules')(['shared', 'shared-ts', 'shared-ui', 'lodash-es'], {
  resolveSymlinks: true,
});

module.exports = withTM({
  future: {
    webpack5: true,
  },
});
