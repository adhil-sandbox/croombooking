import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { Modal } from '../components/Modal';
import { toast } from '../components/Toast';
import { sb } from '../lib/supabase';
import { fmtDate, fmtTime12, minutesToTime, timeToMinutes, currentYearMonth, SLOTS, businessDaysBetween } from '../lib/constants';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { Badge } from '../components/Badge';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export function DashboardView() {
  const { isAdmin, rooms } = useStore();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin) return;
    async function load() {
      setLoading(true);
      const monthStart = fmtDate(new Date()).slice(0, 8) + '01';
      const today = fmtDate(new Date());

      const [{ data: monthBookings }, { data: usageRows }, { data: companies }] = await Promise.all([
        sb.from('bookings').select('*, companies(name), rooms(name)').gte('booking_date', monthStart).lte('booking_date', today).neq('status', 'cancelled'),
        sb.from('monthly_usage').select('*, companies(name,monthly_hours_allocation)').eq('year_month', currentYearMonth()),
        sb.from('companies').select('*'),
      ]);

      const confirmed = (monthBookings || []).filter(b => ['confirmed', 'completed'].includes(b.status));
      const totalHours    = confirmed.reduce((s, b) => s + Number(b.hours), 0);
      const totalBookings = (monthBookings || []).length;
      const pendingCount  = (monthBookings || []).filter(b => b.status === 'pending_approval').length;
      const rejectedCount = (monthBookings || []).filter(b => b.status === 'rejected').length;

      const roomTotals = {};
      rooms.forEach(r => roomTotals[r.name] = 0);
      confirmed.forEach(b => { roomTotals[b.rooms?.name] = (roomTotals[b.rooms?.name] || 0) + Number(b.hours); });

      const slotTotals = {};
      SLOTS.forEach(s => slotTotals[s] = 0);
      confirmed.forEach(b => {
        let m = timeToMinutes(b.start_time.slice(0, 5));
        const endM = timeToMinutes(b.end_time.slice(0, 5));
        while (m < endM) { const key = minutesToTime(m); if (key in slotTotals) slotTotals[key] += 0.5; m += 30; }
      });
      const maxSlot = Math.max(1, ...Object.values(slotTotals));

      const businessDaysSoFar = Math.max(1, businessDaysBetween(monthStart, today));
      const capPerDay = 8.5;
      const utilization = {};
      rooms.forEach(r => {
        const cap = capPerDay * businessDaysSoFar;
        utilization[r.name] = Math.min(100, Math.round(((roomTotals[r.name] || 0) / cap) * 100));
      });

      const sortedUsage = (usageRows || []).slice().sort((a, b) => Number(b.hours_used) - Number(a.hours_used));

      setData({ totalHours, totalBookings, pendingCount, rejectedCount, roomTotals, slotTotals, maxSlot, utilization, sortedUsage, usageRows: usageRows || [] });
      setLoading(false);
    }
    load();
  }, [isAdmin, rooms]);

  if (!isAdmin) return <div className="empty">Admins only.</div>;
  if (loading)  return <div className="empty">Loading dashboard…</div>;
  if (!data)    return null;

  const { totalHours, totalBookings, pendingCount, rejectedCount, roomTotals, slotTotals, maxSlot, utilization, sortedUsage, usageRows } = data;

  const chartColors = ['#2563eb', '#7c3aed'];

  return (
    <div>
      {/* Stats row */}
      <div className="grid grid-4" style={{ marginBottom: 14 }}>
        <div className="card stat"><div className="num">{totalHours}h</div><div className="lbl">Hours booked this month</div></div>
        <div className="card stat"><div className="num">{totalBookings}</div><div className="lbl">Total bookings</div></div>
        <div className="card stat"><div className="num">{pendingCount}</div><div className="lbl">Pending approvals</div></div>
        <div className="card stat"><div className="num">{rejectedCount}</div><div className="lbl">Rejected this month</div></div>
      </div>

      {/* Charts */}
      <div className="grid grid-2" style={{ marginBottom: 14 }}>
        <div className="card">
          <h3>Room utilization (%)</h3>
          <Bar
            data={{
              labels: Object.keys(utilization),
              datasets: [{ label: 'Utilization %', data: Object.values(utilization), backgroundColor: chartColors }]
            }}
            options={{ scales: { y: { beginAtZero: true, max: 100 } }, plugins: { legend: { display: false } } }}
          />
        </div>
        <div className="card">
          <h3>Hours per room this month</h3>
          <Bar
            data={{
              labels: Object.keys(roomTotals),
              datasets: [{ label: 'Hours', data: Object.values(roomTotals), backgroundColor: chartColors }]
            }}
            options={{ scales: { y: { beginAtZero: true } }, plugins: { legend: { display: false } } }}
          />
        </div>
      </div>

      {/* Heatmap */}
      <div className="card" style={{ marginBottom: 14 }}>
        <h3>Popular time slots (this month)</h3>
        {SLOTS.map(s => {
          const val = slotTotals[s];
          const intensity = val / maxSlot;
          const bg = `rgba(37,99,235,${0.08 + intensity * 0.75})`;
          return (
            <div key={s} className="heatmap-row">
              <div className="heatmap-lbl">{fmtTime12(s)}</div>
              <div className="heatmap-cell" style={{ background: bg }} title={`${val}h booked`} />
            </div>
          );
        })}
      </div>

      {/* Most / Least active */}
      <div className="grid grid-2" style={{ marginBottom: 14 }}>
        <div className="card">
          <h3>Most active companies</h3>
          <CompanyList rows={sortedUsage.slice(0, 3)} />
        </div>
        <div className="card">
          <h3>Least active companies</h3>
          <CompanyList rows={[...sortedUsage].reverse().slice(0, 3)} />
        </div>
      </div>

      {/* Full usage table */}
      <div className="card table-scroll">
        <h3>Company usage — this month</h3>
        <table>
          <thead>
            <tr><th>Company</th><th>Used</th><th>Quota</th><th>Extra</th><th>Remaining</th></tr>
          </thead>
          <tbody>
            {usageRows.length === 0
              ? <tr><td colSpan={5} className="empty">No usage yet this month.</td></tr>
              : usageRows.map(u => (
                  <tr key={u.company_id}>
                    <td>{u.companies?.name || '—'}</td>
                    <td>{u.hours_used}h</td>
                    <td>{u.companies?.monthly_hours_allocation}h</td>
                    <td>{u.extra_hours_used > 0 ? <Badge status="pending_approval">{u.extra_hours_used}h</Badge> : '—'}</td>
                    <td>{Math.max(0, (u.companies?.monthly_hours_allocation || 0) - u.hours_used)}h</td>
                  </tr>
                ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CompanyList({ rows }) {
  if (!rows.length) return <div className="empty">No data yet.</div>;
  return (
    <table>
      <tbody>
        {rows.map(u => (
          <tr key={u.company_id}>
            <td>{u.companies?.name || '—'}</td>
            <td style={{ textAlign: 'right' }}>{u.hours_used}h</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
