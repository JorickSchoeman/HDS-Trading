import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("React Error Boundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', backgroundColor: '#fee2e2', color: '#991b1b', border: '1px solid #ef4444', borderRadius: '8px', margin: '20px', fontFamily: 'sans-serif' }}>
          <h2>Oops! Er is iets misgegaan (React Crash)</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '14px' }}>{this.state.error?.toString()}</pre>
          <button onClick={() => window.location.reload()} style={{ padding: '8px 16px', background: '#991b1b', color: 'white', border: 'none', borderRadius: '4px', marginTop: '10px', cursor: 'pointer' }}>Herlaad pagina</button>
        </div>
      );
    }
    return this.props.children; 
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
