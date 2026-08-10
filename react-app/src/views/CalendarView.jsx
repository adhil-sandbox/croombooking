import { useEffect, useCallback, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { sb } from '../lib/supabase';
import {
  fmtDate, fmtDisplayDate, fmtTime12, fmtMonthYear,
  addDays, addMonths, startOfWeek, getMonthGridRange,
  timeToMinutes, minutesToTime,
  SLOTS, BUSINESS_START, BUSINESS_END, SLOT_MINUTES, MAX_DAILY_HOURS,
  currentYearMonth
} from '../lib/constants';
import { Modal } from '../components/Modal';
import { Badge } from '../components/Badge';
import { toast } from '../components/Toast';

function resolveBookingCompanyName(booking, companies) {
  const companyRel = booking.companies || booking.company;
  const directMatch = companies.find(c => String(c.id) === String(booking.company_id));
  if (directMatch?.name) return directMatch.name;
  if (Array.isArray(companyRel)) return companyRel[0]?.name || '—';
  return companyRel?.name || '—';
}

export function CalendarView() {
  const store = useStore();
  const { calMode, calAnchor, setCalMode, setCalAnchor,
    rooms, companies, members, ROOM_COLORS,
    isAdmin, actingCompanyId, actingMemberId,
    monthlyUsage, loadMonthlyUsage, refreshNotifBadge,
    actingCompany, actingMember } = store;

  const [bookings, setBookings] = useState([]);
  const [bookingModal, setBookingModal] = useState(null); // prefill obj
  const [detailBooking, setDetailBooking] = useState(null);
  const [quota, setQuota] = useState(null);

  // Derived range
  let rangeStart, rangeEnd, days;
  if (calMode === 'month') {
    const range = getMonthGridRange(calAnchor);
    rangeStart = range.start; rangeEnd = range.end;
    const total = Math.round((new Date(rangeEnd + 'T00:00:00') - new Date(rangeStart + 'T00:00:00')) / 86400000) + 1;
    days = Array.from({ length: total }, (_, i) => addDays(rangeStart, i));
  } else if (calMode === 'week') {
    rangeStart = startOfWeek(calAnchor);
    rangeEnd = addDays(rangeStart, 6);
    days = Array.from({ length: 7 }, (_, i) => addDays(rangeStart, i));
  } else {
    rangeStart = calAnchor; rangeEnd = calAnchor; days = [calAnchor];
  }

  let titleStr = calMode === 'month'
    ? fmtMonthYear(calAnchor)
    : calMode === 'week'
      ? `${fmtDisplayDate(rangeStart)} – ${fmtDisplayDate(rangeEnd)}`
      : fmtDisplayDate(calAnchor);

  const loadBookings = useCallback(async () => {
    let q = sb.from('bookings')
      .select('*, companies(name,category), members(contact_name), rooms(name)')
      .gte('booking_date', rangeStart)
      .lte('booking_date', rangeEnd)
      .neq('status', 'cancelled')
      .order('start_time');
    // Company users can see all visible bookings on the shared calendar, while quota stays scoped to their company.
    const { data, error } = await q;
    if (!error) setBookings(data || []);
  }, [calMode, calAnchor, isAdmin, actingCompanyId]);

  useEffect(() => { loadBookings(); }, [loadBookings]);

  // Quota banner
  useEffect(() => {
    async function refreshQuota() {
      const company = actingCompany();
      if (!company) { setQuota(null); return; }
      await loadMonthlyUsage();
      const usage = store.monthlyUsage[company.id] || { hours_used: 0, extra_hours_used: 0 };
      const remaining = Math.max(0, company.monthly_hours_allocation - usage.hours_used);
      const pct = Math.min(100, Math.round((usage.hours_used / company.monthly_hours_allocation) * 100));
      setQuota({ company, usage, remaining, pct });
    }
    refreshQuota();
  }, [actingCompanyId, calAnchor]);

  function normalizeAnchor(dateStr) {
    return fmtDate(new Date(dateStr + 'T00:00:00'));
  }

  function prev() {
    const anchor = normalizeAnchor(calAnchor);
    if (calMode === 'month') setCalAnchor(addMonths(anchor, -1));
    else if (calMode === 'week') setCalAnchor(addDays(anchor, -7));
    else setCalAnchor(addDays(anchor, -1));
  }

  function next() {
    const anchor = normalizeAnchor(calAnchor);
    if (calMode === 'month') setCalAnchor(addMonths(anchor, 1));
    else if (calMode === 'week') setCalAnchor(addDays(anchor, 7));
    else setCalAnchor(addDays(anchor, 1));
  }

  const columns = [];
  if (calMode !== 'month') {
    days.forEach(day => rooms.forEach(room => columns.push({ day, room })));
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="cal-toolbar">
        <div className="left">
          <button className="icon-btn" onClick={prev}>←</button>
          <button className="btn btn-sm" onClick={() => setCalAnchor(fmtDate(new Date()))}>Today</button>
          <button className="icon-btn" onClick={next}>→</button>
          <strong className="cal-title">{titleStr}</strong>
        </div>
        <div className="right">
          <div className="segmented">
            {['day', 'week', 'month'].map(m => (
              <button key={m} className={calMode === m ? 'active' : ''}
                onClick={() => setCalMode(m)}>
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setBookingModal({})}>
            + Book
          </button>
        </div>
      </div>

      {/* Quota banner */}
      {quota ? (
        <div className={`notice ${quota.remaining <= 0 ? 'notice-warn' : 'notice-ok'}`}>
          <span>📊</span>
          <span>
            <strong>{quota.company.name}</strong> — {quota.usage.hours_used}h used of {quota.company.monthly_hours_allocation}h ({quota.pct}%),{' '}
            <strong>{quota.remaining}h</strong> remaining.
            {quota.usage.extra_hours_used > 0 && ` ${quota.usage.extra_hours_used}h extra approved.`}
            {' '}Daily limit is {MAX_DAILY_HOURS}h/member.
          </span>
        </div>
      ) : isAdmin && (
        <div className="notice notice-warn">
          <span>👋</span>
          <span>Pick a company in the New Booking dialog to see its quota.</span>
        </div>
      )}

      {/* Calendar grid */}
      <div className="cal-wrap">
        {calMode === 'month'
          ? <MonthGrid days={days} bookings={bookings} calAnchor={calAnchor}
            rooms={rooms} ROOM_COLORS={ROOM_COLORS} companies={companies}
            onAddDay={d => setBookingModal({ date: d })}
            onBooking={b => setDetailBooking(b)} />
          : <DayWeekGrid
            columns={columns} bookings={bookings}
            ROOM_COLORS={ROOM_COLORS} calMode={calMode} companies={companies}
            onCell={({ roomId, date, startTime }) => setBookingModal({ roomId, date, startTime })}
            onRangeSelect={({ roomId, date, startTime, endTime }) => setBookingModal({ roomId, date, startTime, endTime })}
            onBooking={id => setDetailBooking(bookings.find(b => b.id === id))}
          />
        }
      </div>

      {/* Modals */}
      {bookingModal !== null && (
        <BookingModal
          prefill={bookingModal}
          rooms={rooms} companies={companies} members={members}
          isAdmin={isAdmin} actingCompanyId={actingCompanyId} actingMemberId={actingMemberId}
          user={store.user}
          onClose={() => setBookingModal(null)}
          onSuccess={async () => {
            setBookingModal(null);
            await loadBookings();
            await loadMonthlyUsage();
            // also refresh quota banner
            const company = actingCompany();
            if (company) {
              const usage = store.monthlyUsage[company.id] || { hours_used: 0, extra_hours_used: 0 };
              const remaining = Math.max(0, company.monthly_hours_allocation - usage.hours_used);
              const pct = Math.min(100, Math.round((usage.hours_used / company.monthly_hours_allocation) * 100));
              setQuota({ company, usage, remaining, pct });
            }
          }}
        />
      )}
      {detailBooking && (
        <BookingDetailModal
          booking={detailBooking}
          companies={companies}
          isAdmin={isAdmin} actingCompanyId={actingCompanyId}
          onClose={() => setDetailBooking(null)}
          onCancelled={async () => {
            setDetailBooking(null);
            await loadBookings();
            await loadMonthlyUsage();
          }}
        />
      )}
    </div>
  );
}

/* ── Month grid ─────────────────────────────────────────── */
function MonthGrid({ days, bookings, calAnchor, rooms, ROOM_COLORS, companies, onAddDay, onBooking }) {
  const today = fmtDate(new Date());

  function isBookingOnSlot(booking, slot) {
    const slotStart = timeToMinutes(slot);
    const slotEnd = slotStart + SLOT_MINUTES;
    const bookingStart = timeToMinutes(booking.start_time.slice(0, 5));
    const bookingEnd = timeToMinutes(booking.end_time.slice(0, 5));
    return slotStart < bookingEnd && slotEnd > bookingStart;
  }

  function isDayFullyBooked(dayBookings) {
    if (!rooms.length) return false;
    return SLOTS.every(slot => rooms.every(room =>
      dayBookings.some(b => b.room_id === room.id && isBookingOnSlot(b, slot))
    ));
  }

  return (
    <div className="month-grid">
      <div className="month-head-row">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
          <div key={d} className="month-head-cell">{d}</div>
        ))}
      </div>
      <div className="month-body">
        {days.map(day => {
          const isOtherMonth = day.slice(0, 7) !== calAnchor.slice(0, 7);
          const isToday = day === today;
          const isPast = day < today;
          const dayNum = Number(day.slice(8, 10));
          const dayBookings = bookings.filter(b => b.booking_date === day);
          return (
            <div
              key={day}
              className={`month-day${isOtherMonth ? ' other-month' : ''}${isToday ? ' today' : ''}${isPast ? ' past' : ''}${isDayFullyBooked(dayBookings) ? ' full' : ''}`}
              onClick={() => !isPast && onAddDay(day)}
            >
              <div className="month-day-header">
                <span className="month-day-num">{dayNum}</span>
                <button
                  className="month-day-add-btn"
                  disabled={isPast}
                  onClick={e => { e.stopPropagation(); if (!isPast) onAddDay(day); }}
                >+
                </button>
              </div>
              <div className="month-bookings-list">
                {dayBookings.map(b => {
                  const colorKey = ROOM_COLORS[b.room_id];
                  const statusClass = b.status === 'pending_approval' ? 'pending_approval' : b.status === 'cancelled' ? 'cancelled' : '';
                  const companyName = resolveBookingCompanyName(b, companies);
                  return (
                    <div
                      key={b.id}
                      className={`month-booking-pill ${statusClass}`}
                      style={{ background: `var(--room-${colorKey}-soft)`, borderLeft: `3px solid var(--room-${colorKey})`, color: 'var(--text)' }}
                      onClick={e => { e.stopPropagation(); onBooking(b); }}
                      title={`${companyName} · ${b.rooms?.name} · ${fmtTime12(b.start_time.slice(0, 5))}–${fmtTime12(b.end_time.slice(0, 5))}`}
                    >
                      <span className="time">
                        {fmtTime12(b.start_time.slice(0, 5))}{' '}
                        <span style={{ fontWeight: 700, color: `var(--room-${colorKey})` }}>{b.rooms?.name}</span>
                      </span>
                      <span>{companyName}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Day/Week grid ──────────────────────────────────────── */
function DayWeekGrid({ columns, bookings, ROOM_COLORS, calMode, companies, onCell, onRangeSelect, onBooking }) {
  const dragStartRef = useRef(null);

  function getSlotBlocks(roomId, day) {
    return bookings.filter(b => b.room_id === roomId && b.booking_date === day).map(b => {
      const top = ((timeToMinutes(b.start_time.slice(0, 5)) - timeToMinutes(BUSINESS_START)) / SLOT_MINUTES) * 44;
      const height = ((timeToMinutes(b.end_time.slice(0, 5)) - timeToMinutes(b.start_time.slice(0, 5))) / SLOT_MINUTES) * 44 - 3;
      const colorVar = `var(--room-${ROOM_COLORS[roomId]})`;
      const statusClass = b.status === 'pending_approval' ? 'pending_approval' : b.status === 'cancelled' ? 'cancelled' : '';
      const companyName = resolveBookingCompanyName(b, companies);
      return (
        <div
          key={b.id}
          className={`cal-slot-block ${statusClass}`}
          style={{ top: top + 1, height, ...(statusClass ? {} : { background: colorVar }) }}
          title={`${companyName} · ${fmtTime12(b.start_time.slice(0, 5))}–${fmtTime12(b.end_time.slice(0, 5))}`}
          onClick={() => onBooking(b.id)}
        >
          {companyName}
          <small>{fmtTime12(b.start_time.slice(0, 5))}–{fmtTime12(b.end_time.slice(0, 5))}{b.status === 'pending_approval' ? ' · pending' : ''}</small>
        </div>
      );
    });
  }

  function isSlotAvailable(roomId, day, slot) {
    const slotStart = timeToMinutes(slot);
    const slotEnd = slotStart + SLOT_MINUTES;
    return !bookings.some(b => {
      if (b.room_id !== roomId || b.booking_date !== day) return false;
      const bookingStart = timeToMinutes(b.start_time.slice(0, 5));
      const bookingEnd = timeToMinutes(b.end_time.slice(0, 5));
      return slotStart < bookingEnd && slotEnd > bookingStart;
    });
  }

  return (
    <div
      className="cal-grid"
      style={{ gridTemplateColumns: `58px repeat(${columns.length}, minmax(110px,1fr))` }}
    >
      <div
        className="cal-head-row"
        style={{ gridTemplateColumns: `58px repeat(${columns.length}, minmax(110px,1fr))`, gridColumn: '1 / -1' }}
      >
        <div className="cal-head-cell" style={{ borderLeft: 'none' }} />
        {columns.map((c, i) => (
          <div key={i} className="cal-head-cell">
            <span className="room-dot" style={{ background: `var(--room-${ROOM_COLORS[c.room.id]})` }} />
            {c.room.name}
            {calMode === 'week' && (
              <div style={{ fontWeight: 500, color: 'var(--text-faint)', fontSize: 11 }}>
                {fmtDisplayDate(c.day)}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="cal-time-col">
        {SLOTS.map(s => <div key={s} className="cal-time-label">{fmtTime12(s)}</div>)}
      </div>

      {columns.map((c, ci) => (
        <div key={ci} style={{ gridColumn: ci + 2, gridRow: 2, display: 'flex', flexDirection: 'column', position: 'relative' }}>
          {SLOTS.map(s => {
            const available = isSlotAvailable(c.room.id, c.day, s);
            return (
              <div
                key={s}
                className={`cal-cell${available ? ' available' : ''}`}
                data-room={c.room.id} data-day={c.day} data-time={s}
                onMouseDown={e => {
                  dragStartRef.current = e.currentTarget;
                  e.currentTarget.classList.add('selecting');
                }}
                onMouseEnter={e => {
                  if (!dragStartRef.current) return;
                  const start = dragStartRef.current;
                  if (start.dataset.room !== c.room.id || start.dataset.day !== c.day) return;
                  // highlight range
                  const parent = start.parentElement;
                  parent.querySelectorAll('.cal-cell.selecting').forEach(el => el.classList.remove('selecting'));
                  const cells = [...parent.querySelectorAll('.cal-cell')];
                  const si = cells.indexOf(start), ei = cells.indexOf(e.currentTarget);
                  const [lo, hi] = si < ei ? [si, ei] : [ei, si];
                  cells.slice(lo, hi + 1).forEach(el => el.classList.add('selecting'));
                }}
                onClick={e => {
                  if (dragStartRef.current === e.currentTarget)
                    onCell({ roomId: c.room.id, date: c.day, startTime: s });
                }}
              >
                {available && <span className="cal-cell-available">Available</span>}
              </div>
            );
          })}
          {getSlotBlocks(c.room.id, c.day)}
        </div>
      ))}
    </div>
  );
}

/* ── Booking create modal ───────────────────────────────── */
function BookingModal({ prefill, rooms, companies, members, isAdmin, actingCompanyId, actingMemberId, user, onClose, onSuccess }) {
  const timeOptions = SLOTS.concat([BUSINESS_END]);
  const activeCompanies = companies.filter(c => c.is_active);

  const [companyId, setCompanyId] = useState(prefill.companyId || actingCompanyId || activeCompanies[0]?.id || '');
  const [memberId, setMemberId] = useState('');
  const [roomId, setRoomId] = useState(prefill.roomId || rooms[0]?.id || '');
  const [date, setDate] = useState(prefill.date || fmtDate(new Date()));
  const [startTime, setStartTime] = useState(prefill.startTime || SLOTS[0]);
  const [endTime, setEndTime] = useState(prefill.endTime || SLOTS[1] || BUSINESS_END);
  const [notes, setNotes] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  const companyMembers = members.filter(m => m.is_active && (m.company_id == companyId));

  useEffect(() => {
    if (isAdmin) {
      const defaultMember = (companyId === actingCompanyId && actingMemberId)
        ? actingMemberId
        : companyMembers[0]?.id || '';
      setMemberId(defaultMember);
    } else {
      setMemberId(actingMemberId || companyMembers[0]?.id || '');
    }
  }, [companyId, members, actingCompanyId, actingMemberId, isAdmin]);

  async function handleSubmit() {
    setNotice(''); setLoading(true);
    if (!companyId || !memberId || !roomId || !date || !startTime || !endTime) {
      setNotice('Please fill in all fields.'); setLoading(false); return;
    }
    const startMin = timeToMinutes(startTime), endMin = timeToMinutes(endTime);
    if (endMin <= startMin) { setNotice('End time must be after start time.'); setLoading(false); return; }
    if (startMin < timeToMinutes(BUSINESS_START) || endMin > timeToMinutes(BUSINESS_END)) {
      setNotice('Bookings must be within business hours (9:30 AM – 6:00 PM).'); setLoading(false); return;
    }
    const hours = (endMin - startMin) / 60;
    if (hours > MAX_DAILY_HOURS) { setNotice(`Max ${MAX_DAILY_HOURS}h per booking.`); setLoading(false); return; }

    const today = fmtDate(new Date());
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    if (date === today && startMin < nowMinutes) {
      setNotice('Start time must be in the future for today.'); setLoading(false); return;
    }

    const { data: dayBookings } = await sb.from('bookings').select('hours,status')
      .eq('member_id', memberId).eq('booking_date', date).in('status', ['confirmed', 'pending_approval', 'completed']);
    const usedToday = (dayBookings || []).reduce((s, b) => s + Number(b.hours), 0);
    if (usedToday + hours > MAX_DAILY_HOURS) {
      setNotice(`Member already has ${usedToday}h today. Max is ${MAX_DAILY_HOURS}h/day.`); setLoading(false); return;
    }

    const { data: overlaps } = await sb.from('bookings').select('id,start_time,end_time')
      .eq('room_id', roomId).eq('booking_date', date).in('status', ['confirmed', 'pending_approval', 'completed']);
    const conflict = (overlaps || []).some(b =>
      startMin < timeToMinutes(b.end_time.slice(0, 5)) && endMin > timeToMinutes(b.start_time.slice(0, 5))
    );
    if (conflict) { setNotice('That room is already booked for part of this time.'); setLoading(false); return; }

    const company = companies.find(c => c.id === companyId);
    const ym = currentYearMonth(date);
    const { data: usageRow } = await sb.from('monthly_usage').select('*')
      .eq('company_id', companyId).eq('year_month', ym).maybeSingle();
    const usedThisMonth = usageRow ? Number(usageRow.hours_used) : 0;
    const allocation = Number(company.monthly_hours_allocation);
    const wouldTotal = usedThisMonth + hours;

    let status = 'confirmed', extraHours = 0;
    if (wouldTotal > allocation) {
      status = 'pending_approval';
      extraHours = Math.min(hours, wouldTotal - allocation);
    }

    const { data: inserted, error } = await sb.from('bookings').insert({
      company_id: companyId, member_id: memberId, room_id: roomId,
      booking_date: date, start_time: startTime, end_time: endTime,
      hours, extra_hours: extraHours, status, notes: notes || null,
      created_by: user?.id || null
    }).select().single();

    if (error) {
      setNotice(error.message.includes('no_overlapping') ? 'That room is already booked for this time.' : error.message);
      setLoading(false); return;
    }

    if (status === 'pending_approval') {
      await sb.from('notifications').insert([
        { recipient_type: 'admin', booking_id: inserted.id, type: 'approval_needed', message: `${company.name} requested ${hours}h on ${date} beyond their monthly quota — needs approval.` },
        { recipient_type: 'member', recipient_id: memberId, booking_id: inserted.id, type: 'quota_exceeded', message: `Your booking on ${date} exceeds your monthly quota and is pending admin approval.` }
      ]);
      toast('Booking submitted — pending approval (over monthly quota).');
    } else {
      await sb.from('notifications').insert([
        { recipient_type: 'member', recipient_id: memberId, booking_id: inserted.id, type: 'confirmed', message: `Your booking for ${company.name} on ${date} (${fmtTime12(startTime)}–${fmtTime12(endTime)}) is confirmed.` }
      ]);
      toast('Booking confirmed.', 'ok');
    }
    setLoading(false);
    onSuccess();
  }

  const footer = (
    <>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
        {loading ? 'Booking…' : 'Book room'}
      </button>
    </>
  );

  return (
    <Modal title="New booking" onClose={onClose} footer={footer}>
      {notice && <div className="notice notice-danger"><span>⚠️</span><span>{notice}</span></div>}

      {isAdmin && (
        <div className="field">
          <label>Company</label>
          <select value={companyId} onChange={e => setCompanyId(e.target.value)}>
            {activeCompanies.map(c => (
              <option key={c.id} value={c.id}>{c.name}{c.category === 'virtual_office' ? ' (Virtual Office)' : ''}</option>
            ))}
          </select>
        </div>
      )}

      <div className="field">
        <label>Member (contact person)</label>
        {isAdmin ? (
          <select value={memberId} onChange={e => setMemberId(e.target.value)}>
            {companyMembers.length
              ? companyMembers.map(m => <option key={m.id} value={m.id}>{m.contact_name}</option>)
              : <option value="">No active members for this company</option>}
          </select>
        ) : (
          <input
            type="text"
            value={companyMembers.find(m => m.id === memberId)?.contact_name || user?.user_metadata?.full_name || user?.email || 'Logged in member'}
            disabled
            style={{ background: 'var(--bg-subtle)', cursor: 'not-allowed', color: 'var(--text-muted)' }}
          />
        )}
      </div>

      <div className="field">
        <label>Conference room</label>
        <select value={roomId} onChange={e => setRoomId(e.target.value)}>
          {rooms.map(r => <option key={r.id} value={r.id}>{r.name} · {r.seats} seats</option>)}
        </select>
      </div>

      <div className="field">
        <label>Date</label>
        <input type="date" value={date} min={fmtDate(new Date())} onChange={e => setDate(e.target.value)} />
      </div>

      <div className="field-row">
        <div className="field">
          <label>Start time</label>
          <select value={startTime} onChange={e => setStartTime(e.target.value)}>
            {timeOptions.map(t => <option key={t} value={t}>{fmtTime12(t)}</option>)}
          </select>
        </div>
        <div className="field">
          <label>End time</label>
          <select value={endTime} onChange={e => setEndTime(e.target.value)}>
            {timeOptions.map(t => <option key={t} value={t}>{fmtTime12(t)}</option>)}
          </select>
        </div>
      </div>

      <div className="field">
        <label>Notes (optional)</label>
        <textarea rows={2} placeholder="Purpose of the meeting…" value={notes} onChange={e => setNotes(e.target.value)} />
      </div>
    </Modal>
  );
}

/* ── Booking detail / cancel modal ─────────────────────── */
function BookingDetailModal({ booking: b, companies, isAdmin, actingCompanyId, onClose, onCancelled }) {
  const today = fmtDate(new Date());
  const companyRel = b.companies;
  const companyName = companies.find(c => String(c.id) === String(b.company_id))?.name
    || (Array.isArray(companyRel) ? companyRel[0]?.name : companyRel?.name)
    || '—';
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = timeToMinutes(b.start_time.slice(0, 5));

  // Booking is past if: (1) date is before today OR (2) date is today AND start time has passed
  const isPast = b.booking_date < today || (b.booking_date === today && startMinutes <= nowMinutes);

  const canManage = ['confirmed', 'pending_approval'].includes(b.status)
    && (isAdmin || b.company_id === actingCompanyId);
  const canCancel = canManage && !isPast;

  async function handleCancel() {
    if (!canCancel) {
      toast('Past bookings cannot be cancelled.', 'err');
      return;
    }
    const { error } = await sb.from('bookings').update({ status: 'cancelled' }).eq('id', b.id);
    if (error) { toast("Couldn't cancel: " + error.message, 'err'); return; }
    await sb.from('notifications').insert([
      { recipient_type: 'member', recipient_id: b.member_id, booking_id: b.id, type: 'cancelled', message: `Booking on ${b.booking_date} was cancelled.` },
      { recipient_type: 'admin', booking_id: b.id, type: 'cancelled', message: `${companyName} cancelled their booking on ${b.booking_date}.` }
    ]);
    toast('Booking cancelled.', 'ok');
    onCancelled();
  }

  const footer = (
    <>
      {canCancel && (
        <button className="btn btn-danger" onClick={handleCancel}>Cancel booking</button>
      )}
      <button className="btn" onClick={onClose}>Close</button>
    </>
  );

  return (
    <Modal title="Booking details" onClose={onClose} footer={footer}>
      <div className="field"><label>Company</label><div>{companyName}</div></div>
      {isAdmin && (
        <div className="field"><label>Member</label><div>{b.members?.contact_name || '—'}</div></div>
      )}
      <div className="field"><label>Room</label><div>{b.rooms?.name || '—'}</div></div>
      <div className="field">
        <label>When</label>
        <div>{fmtDisplayDate(b.booking_date)}, {fmtTime12(b.start_time.slice(0, 5))}–{fmtTime12(b.end_time.slice(0, 5))} ({b.hours}h)</div>
      </div>
      <div className="field"><label>Status</label><div><Badge status={b.status} /></div></div>
      {isAdmin && b.notes && <div className="field"><label>Notes</label><div>{b.notes}</div></div>}
    </Modal>
  );
}
