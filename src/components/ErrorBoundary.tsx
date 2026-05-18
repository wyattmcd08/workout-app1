import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  fallbackLabel?: string
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  reset = () => this.setState({ error: null })

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="px-4 py-12">
          <div className="card-accent p-5">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] opacity-80">
              Something broke
            </div>
            <div className="display mt-1.5" style={{ fontSize: 'clamp(20px, 6vw, 24px)' }}>
              {this.props.fallbackLabel ?? 'This tab hit a bug.'}
            </div>
            <div className="mt-3 text-[11px] opacity-80 leading-relaxed whitespace-pre-wrap break-words">
              {this.state.error.message}
            </div>
            <button
              onClick={this.reset}
              className="mt-4 w-full py-3 rounded-2xl bg-white/15 text-white font-bold active:scale-[0.97] transition-transform"
            >Reload tab</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
