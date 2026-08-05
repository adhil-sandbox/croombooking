import { create } from 'zustand';
import { sb } from '../lib/supabase';
import { fmtDate, currentYearMonth } from '../lib/constants';

export const useStore = create((set, get) => ({
  // Auth
  user: null,
  profile: null,
  isAdmin: false,
  actingCompanyId: null,
  actingMemberId: localStorage.getItem('sb_acting_member_id') || null,

  // Static data
  rooms: [],
  companies: [],
  members: [],
  monthlyUsage: {},
  notifications: [],
  ROOM_COLORS: {},

  // UI
  view: 'calendar',
  calMode: 'week',
  calAnchor: fmtDate(new Date()),
  theme: localStorage.getItem('sb_theme') || 'light',

  // Helpers
  actingCompany: () => {
    const s = get();
    return s.companies.find(c => c.id === s.actingCompanyId) || null;
  },
  actingMember: () => {
    const s = get();
    return s.members.find(m => m.id === s.actingMemberId) || null;
  },

  // Actions
  setView: (view) => set({ view }),
  setCalMode: (calMode) => set({ calMode }),
  setCalAnchor: (calAnchor) => set({ calAnchor }),

  setTheme: (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('sb_theme', theme);
    set({ theme });
  },

  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    get().setTheme(next);
  },

  setActingMemberId: (id) => {
    localStorage.setItem('sb_acting_member_id', id || '');
    set({ actingMemberId: id });
  },

  signIn: async (email, password) => {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    return error;
  },

  signOut: async () => {
    await sb.auth.signOut();
    set({
      user: null, profile: null, isAdmin: false,
      actingCompanyId: null, actingMemberId: null,
    });
  },

  onSignedIn: async (session) => {
    const user = session.user;
    const { data: profile, error } = await sb
      .from('profiles').select('*').eq('id', user.id).single();
    if (error || !profile) {
      await sb.auth.signOut();
      return { error: 'Account not set up. Ask an admin to link it.' };
    }
    const isAdmin = profile.role === 'admin';
    const actingCompanyId = profile.role === 'member' ? profile.company_id : null;
    set({ user, profile, isAdmin, actingCompanyId });
    await get().loadStaticData();
    return { error: null };
  },

  loadStaticData: async () => {
    const [{ data: rooms }, { data: companies }, { data: members }] = await Promise.all([
      sb.from('rooms').select('*').eq('is_active', true).order('name'),
      sb.from('companies').select('*').order('name'),
      sb.from('members').select('*, companies(name,category)').order('contact_name'),
    ]);
    const ROOM_COLORS = {};
    (rooms || []).forEach((r, i) => { ROOM_COLORS[r.id] = i % 2 === 0 ? 'sb1' : 'sb2'; });
    set({ rooms: rooms || [], companies: companies || [], members: members || [], ROOM_COLORS });
    await get().loadMonthlyUsage();
  },

  loadMonthlyUsage: async () => {
    const ym = currentYearMonth();
    const { data } = await sb.from('monthly_usage').select('*').eq('year_month', ym);
    const monthlyUsage = {};
    (data || []).forEach(row => monthlyUsage[row.company_id] = row);
    set({ monthlyUsage });
  },

  loadNotifications: async () => {
    const { isAdmin, actingMember } = get();
    const member = actingMember();
    let q;
    if (isAdmin) {
      q = sb.from('notifications').select('*').eq('recipient_type', 'admin')
        .order('created_at', { ascending: false }).limit(30);
    } else if (member) {
      q = sb.from('notifications').select('*').eq('recipient_type', 'member')
        .eq('recipient_id', member.id).order('created_at', { ascending: false }).limit(30);
    } else {
      set({ notifications: [] });
      return;
    }
    const { data } = await q;
    set({ notifications: data || [] });
  },

  markNotifsRead: async () => {
    const { notifications, isAdmin } = get();
    const ids = notifications.filter(n => !n.is_read).map(n => n.id);
    if (ids.length) await sb.from('notifications').update({ is_read: true }).in('id', ids);
    if (!isAdmin) {
      set({ notifications: notifications.map(n => ({ ...n, is_read: true })) });
    }
  },

  unreadCount: () => {
    const { notifications, isAdmin } = get();
    return isAdmin
      ? notifications.filter(n => !n.is_read).length
      : notifications.length;
  },
}));
