import React from 'react';

type Props = {
  underlined: boolean;
};

export const Subtitle: React.FC<Props> = (props) => {
  return <h2 style={{ textDecoration: props.underlined ? 'underline' : 'none' }}>{props.children}</h2>;
};
