import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Modal } from '../components/Modal';

export function NotificationsPanel({ onClose }) {
  const { notifications, markNotifsRead } = useStore();

  useEffect(() => {
    markNotifsRead();
  }, []);

  const typeIcon = (type) => {
    if (type === 'approval_needed') return '⏳';
    if (type === 'rejected')        return '❌';
    if (type === 'cancelled')       return '🚫';
    return '✅';
  };

  return (
    <Modal
      title="Notifications"
      onClose={onClose}
      footer={<button className="btn w-full" onClick={onClose}>Close</button>}
    >
      <div style={{ maxHeight: '60dvh', overflowY: 'auto' }}>
        {notifications.length === 0 ? (
          <div className="empty">No notifications yet.</div>
        ) : (
          notifications.map(n => (
            <div
              key={n.id}
              className={`notice ${n.is_read ? '' : 'notice-ok'}`}
              style={{ marginBottom: 8 }}
            >
              <span>{typeIcon(n.type)}</span>
              <span>
                {n.message}
                <br />
                <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>
                  {new Date(n.created_at).toLocaleString()}
                </span>
              </span>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}
