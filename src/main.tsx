import { Component, type ReactNode, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import './workspace-panels.css'
import App from './App.tsx'

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error?: Error }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('Application render error:', error, info)
  }

  handleReload = () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(regs => {
        for (const reg of regs) reg.unregister()
      })
    }
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          background: '#f4f7fc',
          color: '#15263e',
          padding: '24px',
          textAlign: 'center'
        }}>
          <div style={{
            background: '#ffffff',
            padding: '36px',
            borderRadius: '14px',
            maxWidth: '460px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.08)',
            border: '1px solid #dce5f0'
          }}>
            <h2 style={{ margin: '0 0 10px', fontSize: '18px', fontWeight: 600 }}>Update Ready</h2>
            <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#60728a', lineHeight: 1.6 }}>
              A new version of Red Lantern Payment Studio was recently deployed. Click below to load the fresh workspace.
            </p>
            <button
              onClick={this.handleReload}
              style={{
                background: '#2563eb',
                color: '#ffffff',
                border: 'none',
                padding: '11px 22px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Refresh Workspace
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

registerSW({
  immediate: true,
  onNeedRefresh() {
    window.location.reload()
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
