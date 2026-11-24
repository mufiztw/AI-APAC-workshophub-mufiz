import './Banner.css'

interface Props {
  kind: 'registered' | 'waitlisted'
  message: string
  onDismiss: () => void
}

function Banner({ kind, message, onDismiss }: Props) {
  return (
    <div className={`banner banner--${kind}`} role="status">
      <span className="banner__message">{message}</span>
      <button
        type="button"
        className="banner__dismiss"
        aria-label="Dismiss notification"
        onClick={onDismiss}
      >
        &times;
      </button>
    </div>
  )
}

export default Banner
