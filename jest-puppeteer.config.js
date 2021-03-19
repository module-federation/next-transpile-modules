const npmBasicAppPath = 'src/__tests__/__apps__/npm-basic';
const yarnWorkspacesAppPath = 'src/__tests__/__apps__/yarn-workspaces/app';
const yarnWorkspacesSymlinksAppPath = 'src/__tests__/__apps__/yarn-workspaces-symlinks/app';
const webpack5AppPath = 'src/__tests__/__apps__/webpack-5/app';
const webpack5SymlinksAppPath = 'src/__tests__/__apps__/webpack-5-symlinks/app';
const pnpmAppPath = 'src/__tests__/__apps__/pnpm';

module.exports = {
  launch: {
    headless: true,
    slowMo: false,
    devtools: true,
  },
  server: [
    {
      command: `npm run start --prefix=${npmBasicAppPath} -- --port 3500`,
      launchTimeout: 20000,
      port: 3500,
    },
    {
      command: `yarn --cwd ${yarnWorkspacesAppPath} run start --port 3501`,
      launchTimeout: 20000,
      port: 3501,
    },
    {
      command: `yarn --cwd ${yarnWorkspacesSymlinksAppPath} run start --port 3502`,
      launchTimeout: 20000,
      port: 3502,
    },
    {
      command: `yarn --cwd ${webpack5AppPath} run start --port 3503`,
      launchTimeout: 20000,
      port: 3503,
    },
    {
      command: `yarn --cwd ${webpack5SymlinksAppPath} run start --port 3504`,
      launchTimeout: 20000,
      port: 3504,
    },
    {
      command: `yarn --cwd ${pnpmAppPath} run start --port 3505`,
      launchTimeout: 20000,
      port: 3505,
    },
  ],
};
