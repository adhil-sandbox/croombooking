import { useEffect } from 'react';
import { sb } from './lib/supabase';
import { useStore } from './store/useStore';
import { AuthView }      from './views/AuthView';
import { CalendarView }  from './views/CalendarView';
import { BookingsView }  from './views/BookingsView';
import { ApprovalsView } from './views/ApprovalsView';
import { MembersView }   from './views/MembersView';
import { DashboardView } from './views/DashboardView';
import { Sidebar }       from './components/Sidebar';
import { BottomTabBar }  from './components/BottomTabBar';
import { TopBar }        from './components/TopBar';
import { toast, ToastContainer } from './components/Toast';

const VIEWS = {
  calendar:   <CalendarView />,
  mybookings: <BookingsView />,
  approvals:  <ApprovalsView />,
  members:    <MembersView />,
  dashboard:  <DashboardView />,
};

export default function App() {
  const { user, profile, isPending, isRejected, view, theme, onSignedIn, loadNotifications, signOut } = useStore();

  async function resubmitRegistration() {
    const { data, error } = await sb.from('profiles')
      .update({ role: 'pending', company_id: null })
      .eq('id', user.id)
      .eq('role', 'rejected')
      .select('*')
      .maybeSingle();

    if (error || !data) {
      toast('Could not resubmit your registration. Please try again later.', 'err');
      return;
    }

    useStore.setState({ profile: data, isPending: true, isRejected: false });
    toast('Registration resubmitted for admin approval.', 'ok');
  }

  // Apply theme on mount and on change
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Try to keep the app in portrait mode on supported browsers
  useEffect(() => {
    const lockOrientation = async () => {
      if (typeof window === 'undefined' || !window.screen) return;
      const screenOrientation = window.screen.orientation || window.screen.mozOrientation || window.screen.msOrientation;
      if (screenOrientation?.lock) {
        try {
          await screenOrientation.lock('portrait');
        } catch (err) {
          // orientation lock may be unsupported or denied
        }
      } else if (window.screen.lockOrientation) {
        window.screen.lockOrientation('portrait');
      }
    };

    lockOrientation();
  }, []);

  // Auth listener
  useEffect(() => {
    const { data: { subscription } } = sb.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        await onSignedIn(session);
        loadNotifications();
      } else if (event === 'SIGNED_OUT') {
        // Reactively clear UI state when Supabase fires sign-out
        // (handles both manual sign-out and session expiry)
        useStore.setState({
          user: null, profile: null, isAdmin: false, isPending: false, isRejected: false,
          actingCompanyId: null, actingMemberId: null,
          rooms: [], companies: [], members: [], monthlyUsage: {},
          notifications: [], ROOM_COLORS: {},
          view: 'calendar', calMode: 'week',
        });
      }
    });

    // Restore existing session on mount
    sb.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        onSignedIn(session).then(() => loadNotifications());
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (!user) return (
    <>
      <AuthView />
      <ToastContainer />
    </>
  );

  if (isRejected) return (
    <>
      <div className="auth-wrap">
        <div className="auth-card" style={{ textAlign: 'center', maxWidth: 440 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>❌</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Registration Rejected</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13.5, marginBottom: 16 }}>
            Signed in as <strong>{user.email}</strong>.
          </p>
          <div className="notice notice-warn" style={{ textAlign: 'left', marginBottom: 20 }}>
            Your registration was rejected by an admin. You can submit a new request for review.
          </div>
          <button className="btn w-full" style={{ justifyContent: 'center', marginBottom: 10 }} onClick={resubmitRegistration}>
            Submit a new request
          </button>
          <button className="btn w-full" style={{ justifyContent: 'center' }} onClick={() => signOut()}>
            Sign out
          </button>
        </div>
      </div>
      <ToastContainer />
    </>
  );

  if (isPending) return (
    <>
      <div className="auth-wrap">
        <div className="auth-card" style={{ textAlign: 'center', maxWidth: 440 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
            {profile?.role === 'rejected' ? 'Registration Rejected' : 'Account Pending Approval'}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13.5, marginBottom: 16 }}>
            Signed in as <strong>{user.email}</strong>.
          </p>
          {profile?.role === 'rejected' && (
            <>
              <div className="notice notice-warn rejected-registration" style={{ textAlign: 'left', marginBottom: 20 }}>
                Your registration was rejected by an admin. You can submit a new request for review.
              </div>
              <button className="btn w-full" style={{ justifyContent: 'center', marginBottom: 10 }} onClick={resubmitRegistration}>
                Submit a new request
              </button>
            </>
          )}
          {profile?.role !== 'rejected' && (
          <div className="notice notice-warn" style={{ textAlign: 'left', marginBottom: 20 }}>
            <span>ℹ️</span>
            <span>Your Google account is registered. An admin must assign your company before you can view and book rooms.</span>
          </div>
          )}
          <button className="btn w-full" style={{ justifyContent: 'center' }} onClick={() => signOut()}>
            Sign out
          </button>
        </div>
      </div>
      <ToastContainer />
    </>
  );

  return (
    <>
      <div className="app-shell">
        <Sidebar />
        <div className="main">
          <TopBar />
          <div className="content">
            {VIEWS[view] || <CalendarView />}
          </div>
        </div>
        <BottomTabBar />
      </div>
      <ToastContainer />
    </>
  );
}
