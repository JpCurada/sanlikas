import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { AuthorityProfile, Report } from '@/lib/types';
import { Dashboard } from './Dashboard';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { signOut } from './actions';

/**
 * Authority dashboard. Server component: gates on a signed-in user AND an
 * authority_profiles row (the role). Non-authorities are signed out — RLS would
 * block their writes regardless, but we fail fast in the UI too.
 */
export default async function Page() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('authority_profiles')
    .select('user_id, agency, full_name')
    .eq('user_id', user.id)
    .maybeSingle<AuthorityProfile>();

  if (!profile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <Navbar />
        <main
          className="container"
          style={{ flex: 1, maxWidth: 560, display: 'flex', alignItems: 'center' }}
        >
          <div className="card" style={{ width: '100%', boxShadow: 'var(--shadow-md)' }}>
            <h2>Account not authorized</h2>
            <p className="muted" style={{ marginTop: -4 }}>
              You are signed in as {user.email}, but this account is not registered as a DRRM
              authority. Contact your administrator to be added to the roster.
            </p>
            <form action={signOut} style={{ marginTop: 8 }}>
              <button className="btn-ghost" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const { data: reports } = await supabase
    .from('reports')
    .select('*')
    .order('created_at', { ascending: false })
    .returns<Report[]>();

  return <Dashboard profile={profile} initialReports={reports ?? []} userEmail={user.email ?? ''} />;
}
