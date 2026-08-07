import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { sb } from '../lib/supabase';
import { currentYearMonth } from '../lib/constants';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { toast } from '../components/Toast';

export function MembersView() {
  const { isAdmin, loadStaticData } = useStore();
  const [companies, setCompanies] = useState([]);
  const [pendingProfiles, setPendingProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Modal states:
  // editCompany: company object to edit, or undefined
  const [editCompany, setEditCompany] = useState(undefined);
  // createCompanyTarget: null (closed), true (standalone create), or pendingProfile object (quick create & assign)
  const [createCompanyTarget, setCreateCompanyTarget] = useState(null);
  
  const [assignMap, setAssignMap] = useState({});

  if (!isAdmin) return <div className="empty">Admins only.</div>;

  async function load() {
    setLoading(true);
    const ym = currentYearMonth();
    const [{ data: cos }, { data: usage }, { data: profiles }, { data: pends }] = await Promise.all([
      sb.from('companies').select('*, members(id,contact_name,email,phone,is_active)').order('name'),
      sb.from('monthly_usage').select('*').eq('year_month', ym),
      sb.from('profiles').select('id,company_id').eq('role', 'member'),
      sb.from('profiles').select('*').or('role.eq.pending,and(role.eq.member,company_id.is.null)').neq('role', 'admin'),
    ]);
    const usageMap = {}; (usage || []).forEach(u => usageMap[u.company_id] = u);
    const loginMap = {}; (profiles || []).forEach(p => { if (p.company_id) loginMap[p.company_id] = p; });
    const enriched = (cos || []).map(c => ({
      ...c,
      usage: usageMap[c.id],
      loginProfile: loginMap[c.id] || null,
    }));
    setCompanies(enriched);
    setPendingProfiles(pends || []);
    setLoading(false);
    loadStaticData(); // sync global store
  }

  useEffect(() => { load(); }, []);

  async function toggleActive(company) {
    await sb.from('companies').update({ is_active: !company.is_active }).eq('id', company.id);
    toast(company.is_active ? 'Company deactivated.' : 'Company activated.', 'ok');
    load();
  }

  async function handleApproveUser(profileId) {
    const companyId = assignMap[profileId] || companies[0]?.id;
    if (!companyId) {
      toast('Please select a company to assign.', 'err');
      return;
    }
    const targetCompany = companies.find(c => c.id === companyId);
    const pendingProfile = pendingProfiles.find(p => p.id === profileId);

    const { error } = await sb.from('profiles').update({
      role: 'member',
      company_id: companyId
    }).eq('id', profileId);

    if (error) {
      toast('Failed to approve: ' + error.message, 'err');
      return;
    }

    // Create a member contact row for this company if one doesn't exist yet
    if (pendingProfile) {
      const { data: existingMembers } = await sb.from('members').select('id').eq('company_id', companyId);
      if (!existingMembers || existingMembers.length === 0) {
        await sb.from('members').insert({
          company_id: companyId,
          contact_name: pendingProfile.full_name || 'Primary Contact',
        });
      }
    }

    toast(`Approved user for ${targetCompany?.name || 'company'}.`, 'ok');
    load();
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Companies & Members</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary btn-sm" onClick={() => setCreateCompanyTarget(true)}>
            + Create Company
          </button>
          <button className="btn btn-sm" onClick={() => setEditCompany(null)}>
            + Add Member
          </button>
        </div>
      </div>

      {loading && <div className="empty">Loading…</div>}

      {!loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Pending Registrations */}
          {pendingProfiles.length > 0 && (
            <div className="card" style={{ border: '1px solid var(--warn)', background: 'var(--warn-soft)' }}>
              <h3 style={{ margin: '0 0 8px', color: 'var(--warn)', fontSize: 14 }}>
                ⏳ Pending Google Registrations ({pendingProfiles.length})
              </h3>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
                The following users signed in with Google and are waiting for company assignment.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {pendingProfiles.map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, background: 'var(--bg)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                    <div>
                      <strong style={{ fontSize: 13 }}>{p.full_name || 'New Google User'}</strong>
                      <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>ID: {p.id}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {companies.length > 0 ? (
                        <>
                          <select
                            style={{ width: 'auto', padding: '4px 8px', fontSize: 12 }}
                            value={assignMap[p.id] || companies[0]?.id || ''}
                            onChange={e => setAssignMap({ ...assignMap, [p.id]: e.target.value })}
                          >
                            {companies.map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                          <button className="btn btn-sm btn-primary" onClick={() => handleApproveUser(p.id)}>
                            Approve & Link
                          </button>
                        </>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No companies yet</span>
                      )}
                      <button className="btn btn-sm" style={{ borderStyle: 'dashed' }} onClick={() => setCreateCompanyTarget(p)}>
                        + New Company
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Companies List */}
          {companies.length === 0 ? (
            <div className="card empty">
              <p style={{ margin: '0 0 12px', fontSize: 14 }}>No companies created yet.</p>
              <button className="btn btn-primary btn-sm" onClick={() => setCreateCompanyTarget(true)}>
                + Create First Company
              </button>
            </div>
          ) : (
            companies.map(c => {
              const primary = (c.members || [])[0];
              const used = c.usage?.hours_used || 0;
              const remaining = Math.max(0, c.monthly_hours_allocation - used);
              return (
                <div key={c.id} className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</div>
                      {primary && (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                          {primary.contact_name}
                          {primary.email && ` · ${primary.email}`}
                          {primary.phone && ` · ${primary.phone}`}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                      <Badge status={c.is_active ? 'confirmed' : 'cancelled'}>
                        {c.is_active ? 'active' : 'inactive'}
                      </Badge>
                      <Badge status={c.loginProfile ? 'confirmed' : 'pending_approval'}>
                        {c.loginProfile ? 'linked' : 'no login'}
                      </Badge>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
                    <Stat label="Category" value={c.category === 'virtual_office' ? 'Virtual Office' : 'Member'} />
                    <Stat label="Quota" value={`${c.monthly_hours_allocation}h`} />
                    <Stat label="Used / Rem" value={`${used}h / ${remaining}h`} />
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn btn-sm" style={{ flex: 1 }} onClick={() => setEditCompany(c)}>Edit</button>
                    <button className="btn btn-sm btn-danger" style={{ flex: 1 }} onClick={() => toggleActive(c)}>
                      {c.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Standalone or Quick Create Company Modal */}
      {createCompanyTarget !== null && (
        <CreateCompanyModal
          pendingUser={typeof createCompanyTarget === 'object' ? createCompanyTarget : null}
          onClose={() => setCreateCompanyTarget(null)}
          onSaved={() => { setCreateCompanyTarget(null); load(); }}
        />
      )}

      {/* Edit Company / Add Member Modal */}
      {editCompany !== undefined && (
        <MemberModal
          company={editCompany}
          onClose={() => setEditCompany(undefined)}
          onSaved={() => { setEditCompany(undefined); load(); }}
        />
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-faint)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function CreateCompanyModal({ pendingUser, onClose, onSaved }) {
  const [companyName, setCompanyName] = useState('');
  const [category, setCategory]       = useState('member');
  const [allocation, setAllocation]   = useState(10);
  const [contactName, setContactName] = useState(pendingUser?.full_name || '');
  const [email, setEmail]             = useState('');
  const [phone, setPhone]             = useState('');
  const [loginUuid, setLoginUuid]     = useState('');
  const [notice, setNotice]           = useState('');
  const [loading, setLoading]         = useState(false);

  async function handleSave() {
    setNotice('');
    if (!companyName.trim()) {
      setNotice('Company name is required.');
      return;
    }
    setLoading(true);

    // 1. Insert into companies table
    const { data: newCo, error: e1 } = await sb.from('companies').insert({
      name: companyName.trim(),
      category,
      monthly_hours_allocation: Number(allocation),
      is_active: true
    }).select().single();

    if (e1) {
      setNotice('Failed to create company: ' + e1.message);
      setLoading(false);
      return;
    }

    // 2. Insert member record if contact name provided or pending user exists
    const contactToUse = contactName.trim() || (pendingUser ? (pendingUser.full_name || 'Primary Contact') : '');
    if (contactToUse) {
      await sb.from('members').insert({
        company_id: newCo.id,
        contact_name: contactToUse,
        email: email.trim() || null,
        phone: phone.trim() || null,
      });
    }

    // 3. If opened from Pending Google User, approve & link user profile to new company
    if (pendingUser) {
      const { error: e2 } = await sb.from('profiles').update({
        role: 'member',
        company_id: newCo.id,
      }).eq('id', pendingUser.id);

      if (e2) {
        toast(`Company created, but linking user failed: ${e2.message}`, 'err');
      } else {
        toast(`Created "${newCo.name}" and assigned ${pendingUser.full_name || 'user'}!`, 'ok');
      }
    } else if (loginUuid.trim()) {
      const { error: e3 } = await sb.from('profiles').upsert({
        id: loginUuid.trim(),
        role: 'member',
        company_id: newCo.id,
        full_name: companyName.trim()
      });
      if (e3) {
        toast('Company created, but linking login user failed: ' + e3.message, 'err');
      } else {
        toast(`Company "${newCo.name}" created and linked!`, 'ok');
      }
    } else {
      toast(`Company "${newCo.name}" created successfully.`, 'ok');
    }

    setLoading(false);
    onSaved();
  }

  const title = pendingUser
    ? `Create & Assign Company for ${pendingUser.full_name || 'User'}`
    : 'Create New Company';

  const footer = (
    <>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
        {loading ? 'Creating…' : pendingUser ? 'Create & Assign' : 'Create Company'}
      </button>
    </>
  );

  return (
    <Modal title={title} onClose={onClose} footer={footer}>
      {notice && <div className="notice notice-danger"><span>⚠️</span><span>{notice}</span></div>}

      <div className="field">
        <label>Company name *</label>
        <input
          value={companyName}
          onChange={e => setCompanyName(e.target.value)}
          placeholder="e.g. Acme Tech Solutions"
          autoFocus
        />
      </div>

      <div className="field-row">
        <div className="field">
          <label>Category</label>
          <select value={category} onChange={e => {
            setCategory(e.target.value);
            if (e.target.value === 'virtual_office') setAllocation(4);
            else setAllocation(10);
          }}>
            <option value="member">Member</option>
            <option value="virtual_office">Virtual Office</option>
          </select>
        </div>
        <div className="field">
          <label>Monthly allocation</label>
          <select value={allocation} onChange={e => setAllocation(e.target.value)}>
            <option value="4">4 hours</option>
            <option value="10">10 hours</option>
            <option value="20">20 hours</option>
            <option value="40">40 hours</option>
          </select>
        </div>
      </div>

      <div className="field">
        <label>Primary contact person {pendingUser ? '(Assigned user)' : '(optional)'}</label>
        <input
          value={contactName}
          onChange={e => setContactName(e.target.value)}
          placeholder="e.g. Jane Doe"
        />
      </div>

      <div className="field-row">
        <div className="field">
          <label>Email (optional)</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="contact@company.com" />
        </div>
        <div className="field">
          <label>Phone (optional)</label>
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 555-0199" />
        </div>
      </div>

      {!pendingUser && (
        <>
          <div className="field">
            <label>Login user UUID (optional)</label>
            <input value={loginUuid} onChange={e => setLoginUuid(e.target.value)} placeholder="from Supabase → Authentication → Users" />
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--text-faint)', margin: 0 }}>
            If created in Supabase Auth, paste its UUID here to link it immediately.
          </p>
        </>
      )}
    </Modal>
  );
}

function MemberModal({ company, onClose, onSaved }) {
  const primary = company?.members?.[0];
  const [companyName, setCompanyName] = useState(company?.name || '');
  const [contactName, setContactName] = useState(primary?.contact_name || '');
  const [email, setEmail]             = useState(primary?.email || '');
  const [phone, setPhone]             = useState(primary?.phone || '');
  const [category, setCategory]       = useState(company?.category || 'member');
  const [allocation, setAllocation]   = useState(company?.monthly_hours_allocation || 10);
  const [loginUuid, setLoginUuid]     = useState(company?.loginProfile?.id || '');
  const [notice, setNotice]           = useState('');
  const [loading, setLoading]         = useState(false);

  async function handleSave() {
    setNotice(''); setLoading(true);
    if (!companyName || !contactName) {
      setNotice('Company name and contact person are required.'); setLoading(false); return;
    }
    let companyId;
    if (company) {
      const { error: e1 } = await sb.from('companies').update({ name: companyName, category, monthly_hours_allocation: Number(allocation) }).eq('id', company.id);
      if (e1) { setNotice(e1.message); setLoading(false); return; }
      companyId = company.id;
      if (primary) {
        await sb.from('members').update({ contact_name: contactName, email: email || null, phone: phone || null }).eq('id', primary.id);
      } else {
        await sb.from('members').insert({ company_id: company.id, contact_name: contactName, email: email || null, phone: phone || null });
      }
    } else {
      const { data: newCo, error: e1 } = await sb.from('companies').insert({ name: companyName, category, monthly_hours_allocation: Number(allocation) }).select().single();
      if (e1) { setNotice(e1.message); setLoading(false); return; }
      companyId = newCo.id;
      await sb.from('members').insert({ company_id: newCo.id, contact_name: contactName, email: email || null, phone: phone || null });
    }
    if (loginUuid) {
      const { error: e2 } = await sb.from('profiles').upsert({ id: loginUuid, role: 'member', company_id: companyId, full_name: companyName });
      if (e2) { toast('Company saved, but linking the login failed: ' + e2.message, 'err'); onSaved(); return; }
    }
    toast('Saved.', 'ok');
    setLoading(false);
    onSaved();
  }

  const footer = (
    <>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary" onClick={handleSave} disabled={loading}>{loading ? 'Saving…' : 'Save'}</button>
    </>
  );

  return (
    <Modal title={company ? 'Edit company details' : 'Add member'} onClose={onClose} footer={footer}>
      {notice && <div className="notice notice-danger"><span>⚠️</span><span>{notice}</span></div>}
      <div className="field"><label>Company name</label><input value={companyName} onChange={e => setCompanyName(e.target.value)} /></div>
      <div className="field"><label>Contact person</label><input value={contactName} onChange={e => setContactName(e.target.value)} /></div>
      <div className="field-row">
        <div className="field"><label>Email (optional)</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
        <div className="field"><label>Phone (optional)</label><input value={phone} onChange={e => setPhone(e.target.value)} /></div>
      </div>
      <div className="field-row">
        <div className="field">
          <label>Category</label>
          <select value={category} onChange={e => { setCategory(e.target.value); if (e.target.value === 'virtual_office') setAllocation(4); }}>
            <option value="member">Member</option>
            <option value="virtual_office">Virtual Office</option>
          </select>
        </div>
        <div className="field">
          <label>Monthly allocation</label>
          <select value={allocation} onChange={e => setAllocation(e.target.value)}>
            <option value="4">4 hours</option>
            <option value="10">10 hours</option>
            <option value="20">20 hours</option>
            <option value="40">40 hours</option>
          </select>
        </div>
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--text-faint)', margin: '0 0 12px' }}>
        Virtual Office defaults to 4h/month; change here to override.
      </p>
      <div className="field">
        <label>Login user UUID (optional)</label>
        <input value={loginUuid} onChange={e => setLoginUuid(e.target.value)} placeholder="from Supabase → Authentication → Users" />
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--text-faint)', margin: 0 }}>
        Create the company's account in Supabase Auth, then paste its UUID here to link it.
      </p>
    </Modal>
  );
}

