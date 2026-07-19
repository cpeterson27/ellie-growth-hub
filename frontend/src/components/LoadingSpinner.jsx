import './LoadingSpinner.css'

export default function LoadingSpinner({ size = 18 }) {
  return <span className="loading-spinner" style={{ width: size, height: size }} />
}
