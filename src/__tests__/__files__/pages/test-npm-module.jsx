import React from 'react';
import add from 'lodash-es/add';

const HomePage = () => {
  return <h1>The answer is {add(40, 4)}</h1>;
};

export default HomePage;
