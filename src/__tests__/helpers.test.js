const rewire = require('rewire');

// TODO: remove me and mock path.sep instead
const process = require('process');
const testif = (condition) => (condition ? test : test.skip);

const withTmRewire = rewire('../next-transpile-modules');

const regexEqual = withTmRewire.__get__('regexEqual');
const createWebpackMatcher = withTmRewire.__get__('createWebpackMatcher');

describe('regexEqual', () => {
  // Cannot test because of Jest https://github.com/facebook/jest/issues/2549
  // test('should return true if two regexps are similar', () => {
  //   expect(regexEqual(/a/, /a/)).toBe(true);
  //   expect(regexEqual(/a/gi, /a/ig)).toBe(true);
  // });

  test('should return false if two regexps are different', () => {
    expect(regexEqual(/a/, /[\\/]a[\\/]/)).toBe(false);
  });
});

describe('createWebpackMatcher', () => {
  const UNIX_MODULES_PATH = ['/Users/Test/app/node_modules/test', '/Users/Test/app/node_modules/@scoped/scoped-module'];
  const WINDOWS_MODULES_PATH = ['C:\\app\\node_modules\\test', 'C:\\app\\node_modules\\@scoped\\scoped-module'];

  describe('should return true for modules that should be transpiled', () => {
    testif(process.platform !== 'win32')('linux/darwin', () => {
      const matcher = createWebpackMatcher(UNIX_MODULES_PATH);

      expect(matcher('/Users/Test/app/node_modules/test/some-file.js')).toBe(true);
      expect(matcher('/Users/Test/app/node_modules/@scoped/scoped-module/some-file.js')).toBe(true);
    });

    testif(process.platform === 'win32')('win32', () => {
      const matcher = createWebpackMatcher(WINDOWS_MODULES_PATH);

      expect(matcher('C:\\app\\node_modules\\test\\some-file.js')).toBe(true);
      expect(matcher('C:\\app\\node_modules\\@scoped\\scoped-module\\some-file.js')).toBe(true);
    });
  });

  describe('should return false for other modules', () => {
    testif(process.platform !== 'win32')('linux/darwin', () => {
      const matcher = createWebpackMatcher(UNIX_MODULES_PATH);

      expect(matcher('/Users/Test/app/node_modules/nope/some-file.js')).toBe(false);
      expect(matcher('/Users/Test/app/node_modules/@nope-scope/scoped-module/some-file.js')).toBe(false);
    });

    testif(process.platform === 'win32')('win32', () => {
      const matcher = createWebpackMatcher(WINDOWS_MODULES_PATH);

      expect(matcher('C:\\app\\node_modules\\nope\\some-file.js')).toBe(false);
      expect(matcher('C:\\app\\node_modules\\@nope-scoped\\scoped-module\\some-file.js')).toBe(false);
    });
  });

  describe('should return false for nested node_modules', () => {
    testif(process.platform !== 'win32')('linux/darwin', () => {
      const matcher = createWebpackMatcher(UNIX_MODULES_PATH);

      expect(matcher('/Users/Test/app/node_modules/test/node_modules/nested/some-file.js')).toBe(false);
      expect(matcher('/Users/Test/app/node_modules/@scoped/scoped-module/node_modules/nested/some-file.js')).toBe(
        false
      );
    });

    testif(process.platform === 'win32')('win32', () => {
      const matcher = createWebpackMatcher(WINDOWS_MODULES_PATH);

      expect(matcher('C:\\app\\node_modules\\test\\node_modules\\nested\\some-file.js')).toBe(false);
      expect(matcher('C:\\app\\node_modules\\@scoped\\scoped-module\\node_modules\\nested\\some-file.js')).toBe(false);
    });
  });
});
