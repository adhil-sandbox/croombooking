import { useState, useCallback, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { sb } from '../lib/supabase';
import { fmtDisplayDate, fmtTime12, fmtDate } from '../lib/constants';
import { Badge } from '../components/Badge';

function getBookingCompanyName(booking, companies) {
  const companyRel = booking.companies || booking.company;
  const directMatch = companies.find(c => String(c.id) === String(booking.company_id));
  if (directMatch?.name) return directMatch.name;
  if (Array.isArray(companyRel)) return companyRel[0]?.name || '—';
  return companyRel?.name || '—';
}

export function BookingsView() {
  const { companies, actingCompanyId, isAdmin } = useStore();
  const [companyFilter, setCompanyFilter] = useState('');
  const [statusFilter, setStatusFilter]   = useState('');
  const [fromDate, setFromDate]           = useState('');
  const [toDate, setToDate]               = useState('');
  const [bookings, setBookings]           = useState(null);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    let q = sb.from('bookings')
      .select('*, companies(name), members(contact_name), rooms(name)')
      .order('booking_date', { ascending: false });
    const filterCompanyId = isAdmin ? companyFilter : '';
    if (filterCompanyId) q = q.eq('company_id', filterCompanyId);
    if (statusFilter)  q = q.eq('status', statusFilter);
    if (fromDate)      q = q.gte('booking_date', fromDate);
    if (toDate)        q = q.lte('booking_date', toDate);
    const { data, error: err } = await q.limit(200);
    setLoading(false);
    if (err) { setError(err.message); return; }
    setBookings(data || []);
  }, [companyFilter, statusFilter, fromDate, toDate, isAdmin, actingCompanyId]);

  // Auto-load on first render
  useEffect(() => { load(); }, []);

  const statuses = ['confirmed', 'pending_approval', 'completed', 'cancelled', 'rejected'];

  return (
    <div>
      <div className="filter-bar">
        {isAdmin && (
          <select value={companyFilter} onChange={e => setCompanyFilter(e.target.value)}>
            <option value="">All companies</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {statuses.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} placeholder="From" />
        <input type="date" value={toDate}   onChange={e => setToDate(e.target.value)}   placeholder="To" />
        <button className="btn btn-sm btn-primary" onClick={load}>Filter</button>
      </div>

      <div className="card table-scroll">
        {loading && <div className="empty">Loading…</div>}
        {error   && <div className="empty" style={{ color: 'var(--danger)' }}>{error}</div>}
        {bookings !== null && !loading && (
          bookings.length === 0
            ? <div className="empty">No bookings found.</div>
            : (
                <>
                  {/* Card list on small screens */}
                  <div className="booking-cards">
                    {bookings.map(b => (
                      <BookingCard key={b.id} booking={b} companies={companies} isAdmin={isAdmin} />
                    ))}
                  </div>
                </>
              )
        )}
      </div>

      <style>{`
        .booking-cards { display: flex; flex-direction: column; gap: 0; }
        .booking-card {
          display: flex; flex-direction: column; gap: 4px;
          padding: 12px 0; border-bottom: 1px solid var(--border);
        }
        .booking-card:last-child { border-bottom: none; }
        .booking-card-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .booking-card-primary { font-weight: 600; font-size: 13.5px; }
        .booking-card-meta { font-size: 12px; color: var(--text-muted); }
      `}</style>
    </div>
  );
}

function BookingCard({ booking: b, companies, isAdmin }) {
  const companyName = getBookingCompanyName(b, companies);

  return (
    <div className="booking-card">
      <div className="booking-card-row">
        <span className="booking-card-primary">
          {b.rooms?.name} — {fmtDisplayDate(b.booking_date)}
        </span>
        <Badge status={b.status} />
      </div>
      <div className="booking-card-meta">
        {fmtTime12(b.start_time.slice(0,5))}–{fmtTime12(b.end_time.slice(0,5))} · {b.hours}h
        {b.extra_hours > 0 && <span style={{ color: 'var(--warn)' }}> (+{b.extra_hours}h extra)</span>}
      </div>
      {isAdmin ? (
        b.members?.contact_name && <div className="booking-card-meta">{b.members.contact_name} · {companyName}</div>
      ) : (
        companyName && <div className="booking-card-meta">{companyName}</div>
      )}
    </div>
  );
}
