import { useState } from 'react';
import { useStore } from '../store/useStore';
import { NotificationsPanel } from '../views/NotificationsPanel';

const VIEW_TITLES = {
  calendar:   'Book a room',
  mybookings: 'Bookings',
  approvals:  'Approval queue',
  members:    'Members',
  dashboard:  'Dashboard',
};

export function TopBar() {
  const { view, theme, toggleTheme, unreadCount } = useStore();
  const [showNotifs, setShowNotifs] = useState(false);
  const unread = unreadCount();

  return (
    <>
      <div className="topbar">
        <h1>{VIEW_TITLES[view] || ''}</h1>
        <div className="topbar-actions">
          <button className="icon-btn" onClick={toggleTheme} title="Toggle theme">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button
            className="icon-btn"
            title="Notifications"
            style={{ position: 'relative' }}
            onClick={() => setShowNotifs(true)}
          >
            🔔
            {unread > 0 && (
              <span style={{
                position: 'absolute', top: 4, right: 4,
                width: 8, height: 8, background: 'var(--danger)',
                borderRadius: '50%', display: 'block'
              }} />
            )}
          </button>
        </div>
      </div>

      {showNotifs && <NotificationsPanel onClose={() => setShowNotifs(false)} />}
    </>
  );
}
