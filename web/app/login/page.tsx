'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Navbar } from '@/app/components/Navbar';
import { Footer } from '@/app/components/Footer';
import { signIn } from './actions';

const initial: { error?: string } = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn" type="submit" disabled={pending} style={{ width: '100%' }}>
      {pending ? 'Signing in...' : 'Sign in'}
    </button>
  );
}

export default function LoginPage() {
  const [state, formAction] = useFormState(signIn, initial);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Navbar />
      <main
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 20px',
        }}
      >
        <div style={{ width: '100%', maxWidth: 420 }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <h1 style={{ fontSize: 28 }}>Authority sign in</h1>
            <p className="muted" style={{ marginTop: 8 }}>
              Verified DRRM officers only. File and resolve hazard reports for residents.
            </p>
          </div>

          <form action={formAction} className="card" style={{ boxShadow: 'var(--shadow-md)' }}>
            <div className="field">
              <label htmlFor="email">Official email</label>
              <input id="email" name="email" type="email" required autoComplete="email" placeholder="officer@agency.gov.ph" />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="Enter your password"
              />
            </div>
            {state.error && <p className="error" style={{ marginBottom: 14 }}>{state.error}</p>}
            <SubmitButton />
          </form>

          <p className="hint" style={{ textAlign: 'center', marginTop: 18 }}>
            Accounts are provisioned by an administrator. There is no public sign up, so only
            verified DRRM authorities can publish reports.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
