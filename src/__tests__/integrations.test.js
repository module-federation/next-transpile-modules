describe.each([
  ['npm', 3500], // name of the test, port
  ['yarn-workspaces', 3501],
  ['webpack-5', 3502],
  ['pnpm', 3503],
])('%s integration', (name, port) => {
  const BASE_URL = `http://localhost:${port}`;

  describe('homepage access', () => {
    test('homepage should be correctly displayed', async () => {
      const page = await browser.newPage();
      const response = await page.goto(`${BASE_URL}/`);

      if (!response) throw new Error('Could not access the page');

      expect(response.status()).toBe(200);

      const content = await page.$eval('h1', (e) => e.textContent);
      expect(content).toBe('Hello World');
    });
  });

  describe('local-module transpilation', () => {
    test('pages using transpiled modules should be correctly displayed', async () => {
      const page = await browser.newPage();
      const response = await page.goto(`${BASE_URL}/test-local-module`);

      if (!response) throw new Error('Could not access the page');

      expect(response.status()).toBe(200);

      const content = await page.$eval('h1', (e) => e.textContent);
      expect(content).toBe('The answer is 42');

      const otherContent = await page.$eval('h2', (e) => e.textContent);
      expect(otherContent).toBe('The answer is not 80');

      const otherOtherContent = await page.$eval('h3', (e) => e.textContent);
      expect(otherOtherContent).toBe('The answer is even less 38');
    });
  });

  describe('local-typescript-module transpilation', () => {
    test('pages using transpiled modules (helpers or React components) should be correctly displayed', async () => {
      const page = await browser.newPage();
      const response = await page.goto(`${BASE_URL}/test-local-typescript-module`);

      if (!response) throw new Error('Could not access the page');

      expect(response.status()).toBe(200);

      const content = await page.$eval('h1', (e) => e.textContent);
      expect(content).toBe('The answer is 43');

      const content2 = await page.$eval('h2', (e) => e.textContent);
      expect(content2).toBe('And this is a subtitle');
    });
  });

  describe('npm-module transpilation', () => {
    test('pages using transpiled modules should be correctly displayed', async () => {
      const page = await browser.newPage();
      const response = await page.goto(`${BASE_URL}/test-npm-module`);

      if (!response) throw new Error('Could not access the page');

      expect(response.status()).toBe(200);

      const content = await page.$eval('h1', (e) => e.textContent);
      expect(content).toBe('The answer is 44');
    });
  });

  describe('css-module transpilation', () => {
    test('pages using transpiled modules should be correctly displayed', async () => {
      const page = await browser.newPage();
      const response = await page.goto(`${BASE_URL}/test-css-module`);

      if (!response) throw new Error('Could not access the page');

      expect(response.status()).toBe(200);

      const content = await page.$eval('button', (e) => e.textContent);
      expect(content).toBe('Styled button');

      const className = await page.$eval('button', (e) => e.classList[0]);
      expect(className.includes('Button_error__')).toBe(true);
    });
  });

  describe('scss-module transpilation', () => {
    test('pages using transpiled modules should be correctly displayed', async () => {
      const page = await browser.newPage();
      const response = await page.goto(`${BASE_URL}/test-scss-module`);

      if (!response) throw new Error('Could not access the page');

      expect(response.status()).toBe(200);

      const className = await page.$eval('input', (e) => e.classList[0]);
      expect(className.includes('Input_input__')).toBe(true);
    });
  });
});
