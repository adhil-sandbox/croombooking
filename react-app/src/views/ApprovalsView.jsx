import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { sb } from '../lib/supabase';
import { fmtDisplayDate, fmtTime12 } from '../lib/constants';
import { Badge } from '../components/Badge';
import { toast } from '../components/Toast';

export function ApprovalsView() {
  const { isAdmin, loadMonthlyUsage } = useStore();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading]  = useState(true);
  const user = useStore(s => s.user);

  async function load() {
    setLoading(true);
    const { data, error } = await sb.from('bookings')
      .select('*, companies(name,monthly_hours_allocation), members(contact_name), rooms(name)')
      .eq('status', 'pending_approval')
      .order('booking_date');
    setLoading(false);
    if (!error) setBookings(data || []);
  }

  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  if (!isAdmin) return <div className="empty">Admins only.</div>;

  async function resolve(bookingId, newStatus) {
    const { data: b, error } = await sb.from('bookings').update({
      status: newStatus,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      extra_hours: newStatus === 'rejected' ? 0 : undefined
    }).eq('id', bookingId).select().single();
    if (error) { toast('Failed: ' + error.message, 'err'); return; }
    await sb.from('notifications').insert({
      recipient_type: 'member', recipient_id: b.member_id, booking_id: b.id,
      type: newStatus,
      message: newStatus === 'confirmed'
        ? `Your over-quota booking on ${b.booking_date} was approved and is now confirmed.`
        : `Your over-quota booking on ${b.booking_date} was rejected by admin.`
    });
    toast(newStatus === 'confirmed' ? 'Booking approved.' : 'Booking rejected.', 'ok');
    await loadMonthlyUsage();
    load();
  }

  return (
    <div>
      <div className="card">
        <h3>Pending approval</h3>
        {loading && <div className="empty">Loading…</div>}
        {!loading && bookings.length === 0 && (
          <div className="empty">No bookings waiting on approval 🎉</div>
        )}
        {!loading && bookings.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {bookings.map(b => (
              <ApprovalCard key={b.id} booking={b} onResolve={resolve} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ApprovalCard({ booking: b, onResolve }) {
  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
      padding: 14, display: 'flex', flexDirection: 'column', gap: 8
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{b.companies?.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {b.members?.contact_name} · {b.rooms?.name}
          </div>
        </div>
        <Badge status="pending_approval" />
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
        📅 {fmtDisplayDate(b.booking_date)} &nbsp;
        🕐 {fmtTime12(b.start_time.slice(0,5))}–{fmtTime12(b.end_time.slice(0,5))} &nbsp;
        <span style={{ color: 'var(--warn)', fontWeight: 600 }}>+{b.extra_hours}h over quota</span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => onResolve(b.id, 'confirmed')}>
          ✓ Approve
        </button>
        <button className="btn btn-danger btn-sm" style={{ flex: 1 }} onClick={() => onResolve(b.id, 'rejected')}>
          ✕ Reject
        </button>
      </div>
    </div>
  );
}
