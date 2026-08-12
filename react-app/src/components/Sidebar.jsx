import { useStore } from '../store/useStore';
import sandboxLogo from '../assets/sandbox-logo.png';

const VIEWS = {
  calendar: { label: 'Book', icon: '📅' },
  mybookings: { label: 'Bookings', icon: '🗂' },
  approvals: { label: 'Approvals', icon: '✅' },
  members: { label: 'Members', icon: '🏢' },
  dashboard: { label: 'Dashboard', icon: '📊' },
};

export function Sidebar() {
  const { view, setView, isAdmin, profile, actingCompany, actingMember, signOut } = useStore();
  const company = actingCompany();
  const member = actingMember();
  const displayName = profile?.full_name || company?.name || '—';
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <aside className="sidebar">
      <div className="brand">
        <img src={sandboxLogo} alt="Sandbox" className="brand-img" />
      </div>

      <NavItem v="calendar" current={view} setView={setView} />
      <NavItem v="mybookings" current={view} setView={setView} />

      {isAdmin && (
        <>
          <div className="nav-section-label">Admin</div>
          <NavItem v="approvals" current={view} setView={setView} />
          <NavItem v="members" current={view} setView={setView} />
          <NavItem v="dashboard" current={view} setView={setView} />
        </>
      )}

      <div className="sidebar-footer">
        <div className="user-chip">
          <div className="avatar">{initials}</div>
          <div className="who">
            <div className="name">{displayName}</div>
            <div className="role">{isAdmin ? 'admin' : 'company login'}</div>
          </div>
        </div>
        <button
          className="btn btn-ghost btn-sm w-full mt-2"
          style={{ justifyContent: 'center' }}
          onClick={signOut}
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}

function NavItem({ v, current, setView }) {
  const { icon, label } = VIEWS[v];
  return (
    <div
      className={`nav-item${current === v ? ' active' : ''}`}
      onClick={() => setView(v)}
    >
      {icon} {label}
    </div>
  );
}
