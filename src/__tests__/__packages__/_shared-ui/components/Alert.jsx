import './Alert.scss';

function Alert(props) {
  return (
    <textarea className='alert'>
      {props.children}
    </textarea>
  );
}

export default Alert;
