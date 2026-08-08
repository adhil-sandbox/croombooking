import { useState } from 'react';
import { useStore } from '../store/useStore';
import { NotificationsPanel } from '../views/NotificationsPanel';
import sandboxLogo from '../assets/sandbox-logo.png';

const VIEW_TITLES = {
  calendar:   'Book a room',
  mybookings: 'Bookings',
  approvals:  'Approval queue',
  members:    'Members',
  dashboard:  'Dashboard',
};

export function TopBar() {
  const { view, theme, toggleTheme, unreadCount, isAdmin, actingCompany, actingMemberId, setActingMemberId, members, signOut } = useStore();
  const [showNotifs, setShowNotifs] = useState(false);
  const unread = unreadCount();
  const company = actingCompany();
  const companyMembers = company ? members.filter(m => m.is_active && m.company_id === company.id) : [];

  return (
    <>
      <div className="topbar">
        <div className="topbar-title-group">
          <div className="topbar-brand-row">
            <img src={sandboxLogo} alt="Sandbox" className="mobile-brand-img" />
          </div>
          {!isAdmin && company && (
            <div className="topbar-company-info">
              <span className="company-label">Booking as</span>
              <span className="company-name">{company.name}</span>
            </div>
          )}
        </div>
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

      {!isAdmin && company && (
        <div className="mobile-acting-box">
          <div className="acting-company-name">{company.name}</div>
          <select
            value={actingMemberId || ''}
            onChange={e => setActingMemberId(e.target.value || null)}
          >
            <option value="">Select contact…</option>
            {companyMembers.map(m => (
              <option key={m.id} value={m.id}>{m.contact_name}</option>
            ))}
          </select>
          <button className="btn btn-ghost btn-sm mobile-signout" onClick={signOut}>
            Sign out
          </button>
        </div>
      )}

      {showNotifs && <NotificationsPanel onClose={() => setShowNotifs(false)} />}
    </>
  );
}
