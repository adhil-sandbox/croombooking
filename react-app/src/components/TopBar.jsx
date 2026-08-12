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
        <div className="topbar-left">
          <img src={sandboxLogo} alt="Sandbox" className="mobile-brand-img" />
          {!isAdmin && company && (
            <div className="topbar-acting-info desktop-only">
              <span className="nav-section-label">Booking as:</span>
              <strong className="acting-company-name">{company.name}</strong>
              {member && (
                <span className="acting-member-name">👤 {member.contact_name}</span>
              )}
            </div>
          )}
        </div>

        <div className="topbar-right">
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

          {!isAdmin && company && (
            <div className="topbar-acting-info mobile-under-buttons">
              <span className="nav-section-label">Booking as:</span>
              <strong className="acting-company-name">{company.name}</strong>
              {member && (
                <span className="acting-member-name">👤 {member.contact_name}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {showNotifs && <NotificationsPanel onClose={() => setShowNotifs(false)} />}
    </>
  );
}
