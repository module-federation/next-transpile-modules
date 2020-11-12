const fse = require('fs-extra');

// Setup local packages
fse.copySync('src/__tests__/__packages__', 'src/__tests__/__apps__');
fse.copySync('src/__tests__/__packages__', 'src/__tests__/__apps__/yarn-workspaces');

// Setup pages for each test
fse.copySync('src/__tests__/__pages__', 'src/__tests__/__apps__/npm-basic/pages');
fse.copySync('src/__tests__/__pages__', 'src/__tests__/__apps__/webpack-5/pages');
fse.copySync('src/__tests__/__pages__', 'src/__tests__/__apps__/yarn-workspaces/app/pages');
fse.copySync('src/__tests__/__pages__', 'src/__tests__/__apps__/pnpm/pages');

// Setup pages for each test
fse.copySync('./src/next-transpile-modules.js', 'src/__tests__/__apps__/npm-basic/next-transpile-modules.js');
fse.copySync('./src/next-transpile-modules.js', 'src/__tests__/__apps__/webpack-5/next-transpile-modules.js');
fse.copySync('./src/next-transpile-modules.js', 'src/__tests__/__apps__/yarn-workspaces/app/next-transpile-modules.js');
fse.copySync('./src/next-transpile-modules.js', 'src/__tests__/__apps__/pnpm/next-transpile-modules.js');
