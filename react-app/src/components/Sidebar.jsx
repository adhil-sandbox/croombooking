import { useStore } from '../store/useStore';

const VIEWS = {
  calendar:   { label: 'Book', icon: '📅' },
  mybookings: { label: 'Bookings', icon: '🗂' },
  approvals:  { label: 'Approvals', icon: '✅' },
  members:    { label: 'Members', icon: '🏢' },
  dashboard:  { label: 'Dashboard', icon: '📊' },
};

export function Sidebar() {
  const { view, setView, isAdmin, profile, actingCompany, actingMember,
          members, actingCompanyId, setActingMemberId, actingMemberId,
          signOut } = useStore();
  const company = actingCompany();
  const companyMembers = members.filter(m => m.is_active && m.company_id === actingCompanyId);
  const displayName = profile?.full_name || company?.name || '—';
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="dot" />
        Sandbox Rooms
      </div>

      {/* Acting box for member logins */}
      {!isAdmin && company && (
        <div className="acting-box">
          <div className="nav-section-label">Booking as</div>
          <div className="acting-company-name">{company.name}</div>
          <select
            value={actingMemberId || ''}
            onChange={e => setActingMemberId(e.target.value || null)}
            style={{ marginBottom: 8 }}
          >
            <option value="">Select contact…</option>
            {companyMembers.map(m => (
              <option key={m.id} value={m.id}>{m.contact_name}</option>
            ))}
          </select>
        </div>
      )}

      <NavItem v="calendar"   current={view} setView={setView} />
      <NavItem v="mybookings" current={view} setView={setView} />

      {isAdmin && (
        <>
          <div className="nav-section-label">Admin</div>
          <NavItem v="approvals"  current={view} setView={setView} />
          <NavItem v="members"    current={view} setView={setView} />
          <NavItem v="dashboard"  current={view} setView={setView} />
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
