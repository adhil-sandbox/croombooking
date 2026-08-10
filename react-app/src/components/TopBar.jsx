import { useState } from 'react';
import { useStore } from '../store/useStore';
import { NotificationsPanel } from '../views/NotificationsPanel';
import sandboxLogo from '../assets/sandbox-logo.png';

export function TopBar() {
  const { theme, toggleTheme, unreadCount, isAdmin, actingCompany, actingMember, signOut } = useStore();
  const [showNotifs, setShowNotifs] = useState(false);
  const unread = unreadCount();
  const company = actingCompany();
  const member = actingMember();

  return (
    <>
      <div className="topbar">
        <div className="topbar-title-group">
          <div className="topbar-brand-row">
            <img src={sandboxLogo} alt="Sandbox" className="mobile-brand-img" />
          </div>
        </div>
        <div className="topbar-actions">
          <button className="icon-btn" onClick={toggleTheme} title="Toggle theme">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button className="icon-btn mobile-signout-icon" onClick={signOut} title="Sign out">
            🔓
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

      {!isAdmin && company && (
        <div className="mobile-acting-box">
          <div>
            <div className="acting-company-name">{company.name}</div>
            {member && (
              <div className="mobile-acting-member-name" style={{ fontSize: 12, marginTop: 2 }}>
                👤 {member.contact_name}
              </div>
            )}
          </div>
        </div>
      )}

      {showNotifs && <NotificationsPanel onClose={() => setShowNotifs(false)} />}
    </>
  );
}
