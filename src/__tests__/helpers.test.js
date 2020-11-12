const rewire = require('rewire');
const anymatch = require('anymatch');

const withTmRewire = rewire('../next-transpile-modules');

const regexEqual = withTmRewire.__get__('regexEqual');

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
