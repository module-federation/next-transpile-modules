module.exports = {
  preset: 'jest-puppeteer',
  testPathIgnorePatterns: ['node_modules', '__apps__'],
  globalSetup: 'jest-environment-puppeteer/setup',
  globalTeardown: 'jest-environment-puppeteer/teardown',
  testEnvironment: 'jest-environment-puppeteer',
  testRegex: '__tests__/.*\\.test\\.(jsx?|tsx?)$',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
};
