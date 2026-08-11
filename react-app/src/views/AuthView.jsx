import { useState } from 'react';
import { useStore } from '../store/useStore';
import sandboxLogo from '../assets/sandbox-logo.png';

export function AuthView() {
  const { signIn, signInWithGoogle } = useStore();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const err = await signIn(email, password);
    setLoading(false);
    if (err) setError(err.message);
  }

  async function handleGoogleSignIn() {
    setError('');
    setGoogleLoading(true);
    const err = await signInWithGoogle();
    if (err) {
      setGoogleLoading(false);
      setError(err.message);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand-head" style={{ marginBottom: 16, justifyContent: 'center' }}>
          <div
            style={{
              background: '#2e4b93',
              padding: '14px 18px',
              borderRadius: 16,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              maxWidth: 240,
              boxShadow: '0 8px 24px rgba(46, 75, 147, 0.2)'
            }}
          >
            <img
              src={sandboxLogo}
              alt="Sandbox Rooms"
              style={{ width: '100%', maxWidth: 188, height: 'auto', display: 'block' }}
            />
          </div>
        </div>
        <p>Sign in with Google or your password account to book a room.</p>

        {error && (
          <div className="notice notice-danger" style={{ marginBottom: 16 }}>
            <span>⚠️</span><span>{error}</span>
          </div>
        )}

        <button
          type="button"
          className="btn w-full"
          style={{
            justifyContent: 'center',
            marginBottom: 16,
            padding: '10px 14px',
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border-strong)',
            fontWeight: 600
          }}
          onClick={handleGoogleSignIn}
          disabled={googleLoading}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" style={{ marginRight: 8 }}>
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
          {googleLoading ? 'Redirecting to Google…' : 'Sign in with Google'}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0', color: 'var(--text-faint)', fontSize: 12 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span>or sign in with password</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary w-full"
            style={{ justifyContent: 'center' }}
            disabled={loading}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
