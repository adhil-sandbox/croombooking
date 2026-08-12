import { create } from 'zustand';
import { sb } from '../lib/supabase';
import { fmtDate, currentYearMonth } from '../lib/constants';

export const useStore = create((set, get) => ({
  // Auth
  user: null,
  profile: null,
  isAdmin: false,
  isPending: false,
  isRejected: false,
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
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return error;

    const user = data?.user;
    if (!user?.id) return null;

    // Let the auth listener create a pending profile if this is a new user.
    return null;
  },

  signInWithGoogle: async () => {
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: 'https://booking.sandboxworkspaces.com'
      }
    });
    return error;
  },

  signOut: async () => {
    localStorage.removeItem('sb_acting_member_id');
    set({ actingMemberId: null });
    await sb.auth.signOut();
    // State is cleared reactively by the SIGNED_OUT handler in App.jsx
  },

  onSignedIn: async (session) => {
    const user = session.user;
    let { data: profile } = await sb
      .from('profiles').select('*').eq('id', user.id).maybeSingle();

    // Diagnostic: persist the fetched profile for debugging sign-in mismatches
    try { window.localStorage.setItem('sb_debug_profile', JSON.stringify(profile || null)); } catch (e) {}
    try { console.debug('onSignedIn: fetched profile', profile); } catch (e) {}

    // If the account has been explicitly rejected (existing profile), keep the user signed in
    // so they can re-submit their registration from the rejected UI.
    if (profile && profile.role === 'rejected') {
      set({ user, profile, isAdmin: false, isPending: false, isRejected: true, actingCompanyId: null });
      return { error: null };
    }

    if (!profile) {
      const payload = {
        id: user.id,
        role: 'pending',
        full_name: user.user_metadata?.full_name || user.email || null,
        company_id: null
      };
      const { data: newProfile, error: newProfileErr } = await sb.from('profiles').insert(payload).select('*').maybeSingle();
      if (newProfileErr) {
        const isDuplicate = newProfileErr.code === '23505' || (newProfileErr.message || '').toLowerCase().includes('duplicate key');
        if (isDuplicate) {
          const { data: existingProfile, error: existingErr } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
          if (!existingErr && existingProfile) {
            profile = existingProfile;
          } else {
            try {
              window.localStorage.setItem('sb_debug_profile_insert_error', JSON.stringify({ payload, error: newProfileErr }, null, 2));
            } catch (e) {}
            await sb.auth.signOut();
            return { error: { message: 'This account is not registered. Contact your admin to create your member profile.' } };
          }
        } else {
          try {
            window.localStorage.setItem('sb_debug_profile_insert_error', JSON.stringify({ payload, error: newProfileErr }, null, 2));
            window.localStorage.setItem('sb_auth_message', 'Registration failed: ' + (newProfileErr.message || 'Unknown error'));
          } catch (e) {}
          await sb.auth.signOut();
          return { error: { message: 'This account is not registered. Contact your admin to create your member profile.' } };
        }
      } else {
        profile = newProfile;
      }
    }

    const isAdmin = profile?.role === 'admin';
    const isRejected = profile?.role === 'rejected';
    const isPending = profile?.role === 'pending' || (!isAdmin && !profile?.company_id);
    const actingCompanyId = profile?.company_id || null;

    set({ user, profile, isAdmin, isPending, isRejected, actingCompanyId });

    if (!isPending) {
      await Promise.all([
        get().loadStaticData(),
        get().loadMonthlyUsage()
      ]);
    }
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

    const { isAdmin, actingCompanyId, user, profile } = get();
    let actingMemberId = get().actingMemberId;

    if (!isAdmin && actingCompanyId) {
      const companyMembers = (members || []).filter(m => m.is_active && m.company_id === actingCompanyId);
      let matched = null;
      if (user?.email) {
        matched = companyMembers.find(m => m.email && m.email.toLowerCase() === user.email.toLowerCase());
      }
      if (!matched && (profile?.full_name || user?.user_metadata?.full_name)) {
        const targetName = (profile?.full_name || user?.user_metadata?.full_name).toLowerCase();
        matched = companyMembers.find(m => m.contact_name && m.contact_name.toLowerCase() === targetName);
      }
      if (!matched && companyMembers.length > 0) {
        matched = companyMembers[0];
      }
      actingMemberId = matched ? matched.id : null;
      if (actingMemberId) {
        localStorage.setItem('sb_acting_member_id', actingMemberId);
      } else {
        localStorage.removeItem('sb_acting_member_id');
      }
    }

    set({ rooms: rooms || [], companies: companies || [], members: members || [], ROOM_COLORS, actingMemberId });
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
