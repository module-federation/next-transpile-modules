import './Textarea.css';

function Textarea(props) {
  return (
    <textarea type='text' className='textarea'>
      {props.children}
    </textarea>
  );
}

export default Textarea;
