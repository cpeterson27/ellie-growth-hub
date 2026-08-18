import './Button.css'
import LoadingSpinner from './LoadingSpinner.jsx'

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  block = false,
  onClick,
  className = '',
  ...props
}) {
  return (
    <button
      type="button"
      className={[
        'btn',
        `btn--${variant}`,
        `btn--${size}`,
        className,
        loading ? 'btn--loading' : '',
        block ? 'btn--block' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      disabled={disabled || loading}
      onClick={onClick}
      {...props}
    >
      {loading ? <LoadingSpinner size={16} /> : null}
      <span>{children}</span>
    </button>
  )
}
