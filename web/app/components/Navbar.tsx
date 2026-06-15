import { Brand } from './Brand';
import { signOut } from '@/app/actions';

interface NavbarProps {
  /** Signed-in officer context; omit on the login screen. */
  user?: { agency: string; name: string } | null;
}

export function Navbar({ user }: NavbarProps) {
  return (
    <header className="nav">
      <Brand />
      <div className="nav-right">
        {user ? (
          <>
            <span className="nav-user">
              <strong>{user.name}</strong>
              {user.agency}
            </span>
            <form action={signOut}>
              <button className="btn-outline" type="submit">
                Sign out
              </button>
            </form>
          </>
        ) : (
          <span className="nav-user muted">DRRM Authority Portal</span>
        )}
      </div>
    </header>
  );
}
