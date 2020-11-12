import React from 'react';
import { multiply } from 'shared';
import { add } from 'shared/utils/calc';
import { substract } from 'shared/utils/substract.mjs';

const HomePage = () => {
  return (
    <>
      <h1>The answer is {add(40, 2)}</h1>
      <h2>The answer is not {multiply(40, 2)}</h2>
      <h3>The answer is even less {substract(40, 2)}</h3>
    </>
  );
};

export default HomePage;
