import { useStore } from '../store/useStore';

const TABS = [
  { v: 'calendar',   icon: '📅', label: 'Book'      },
  { v: 'mybookings', icon: '🗂',  label: 'Bookings'  },
];

const ADMIN_TABS = [
  { v: 'approvals', icon: '✅', label: 'Approvals' },
  { v: 'members',   icon: '🏢', label: 'Members'   },
  { v: 'dashboard', icon: '📊', label: 'Dashboard' },
];

export function BottomTabBar() {
  const { view, setView, isAdmin, notifications, unreadCount } = useStore();
  const tabs = isAdmin ? [...TABS, ...ADMIN_TABS] : TABS;
  const unread = unreadCount();

  return (
    <nav className="bottom-tab-bar">
      {tabs.map(tab => (
        <button
          key={tab.v}
          className={`tab-item${view === tab.v ? ' active' : ''}`}
          onClick={() => setView(tab.v)}
        >
          <span className="tab-icon">{tab.icon}</span>
          <span>{tab.label}</span>
          {tab.v === 'approvals' && unread > 0 && (
            <span className="tab-badge">{unread}</span>
          )}
        </button>
      ))}
    </nav>
  );
}
