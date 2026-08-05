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
import { ToastContainer } from './components/Toast';

const VIEWS = {
  calendar:   <CalendarView />,
  mybookings: <BookingsView />,
  approvals:  <ApprovalsView />,
  members:    <MembersView />,
  dashboard:  <DashboardView />,
};

export default function App() {
  const { user, view, theme, onSignedIn, signOut, loadNotifications } = useStore();

  // Apply theme on mount and on change
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Auth listener
  useEffect(() => {
    sb.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        await onSignedIn(session);
        await loadNotifications();
      }
      if (event === 'SIGNED_OUT') signOut();
    });

    // Restore existing session on mount
    sb.auth.getSession().then(({ data: { session } }) => {
      if (session) onSignedIn(session).then(() => loadNotifications());
    });
  }, []);

  if (!user) return (
    <>
      <AuthView />
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
