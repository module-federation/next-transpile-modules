import styles from './Button.module.css';

function Button(props) {
  return (
    <button
      type='button'
      // Note how the "error" class is accessed as a property on the imported
      // `styles` object.
      className={styles.error}
    >
      {props.children}
    </button>
  );
}

export default Button;
