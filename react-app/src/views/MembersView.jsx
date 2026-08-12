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
  const [roomsList, setRoomsList] = useState([]);
  const [loading, setLoading] = useState(true);

  // Sub-navigation tab: 'companies' or 'rooms'
  const [activeTab, setActiveTab] = useState('companies');

  // Modal states:
  const [createCompanyTarget, setCreateCompanyTarget] = useState(null);
  const [editCompany, setEditCompany] = useState(null); // company object
  const [addMemberCompanyId, setAddMemberCompanyId] = useState(null); // companyId
  const [editMember, setEditMember] = useState(null); // member object
  const [createRoom, setCreateRoom] = useState(false); // boolean
  const [editRoom, setEditRoom] = useState(null); // room object

  const [assignMap, setAssignMap] = useState({});

  if (!isAdmin) return <div className="empty">Admins only.</div>;

  async function load() {
    setLoading(true);
    const ym = currentYearMonth();
    const [{ data: cos }, { data: usage }, { data: profiles }, { data: pends }, { data: rms }] = await Promise.all([
      sb.from('companies').select('*, members(id,company_id,contact_name,email,phone,is_active)').order('name'),
      sb.from('monthly_usage').select('*').eq('year_month', ym),
      sb.from('profiles').select('id,company_id').eq('role', 'member'),
      sb.from('profiles').select('*').or('role.eq.pending,and(role.eq.member,company_id.is.null)').neq('role', 'admin'),
      sb.from('rooms').select('*').order('name'),
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
    setRoomsList(rms || []);
    setLoading(false);
    loadStaticData(); // sync global store
  }

  useEffect(() => {
    load();
  }, []);

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

    if (pendingProfile) {
      await sb.from('members').insert({
        company_id: companyId,
        contact_name: pendingProfile.full_name || 'Primary Contact',
        email: pendingProfile.email || null,
        phone: pendingProfile.phone || null,
        is_active: true
      });
    }

    toast(`Approved user for ${targetCompany?.name || 'company'}.`, 'ok');
    load();
  }

  async function handleDeleteCompany(company) {
    if (!window.confirm(`Are you sure you want to delete "${company.name}"? This will delete the company. It will fail if bookings or other records reference it.`)) return;
    setLoading(true);
    // First, disassociate any linked auth profiles so DB constraints
    // (e.g. chk_profile_role_company) aren't violated when company row is removed.
    const { error: pErr } = await sb.from('profiles').update({ company_id: null, role: 'pending' }).eq('company_id', company.id);
    if (pErr) {
      setLoading(false);
      toast('Failed to update linked profiles: ' + pErr.message, 'err');
      return;
    }

    const { error } = await sb.from('companies').delete().eq('id', company.id);
    setLoading(false);
    if (error) {
      if (error.code === '23503' || error.message.includes('foreign key')) {
        toast('Cannot delete company. Existing bookings or members reference it. Try deactivating it instead.', 'err');
      } else {
        toast('Failed to delete company: ' + error.message, 'err');
      }
    } else {
      toast('Company deleted.', 'ok');
      load();
    }
  }

  async function handleDeleteMember(member) {
    if (!window.confirm(`Are you sure you want to delete member "${member.contact_name}"?`)) return;
    setLoading(true);
    const { error } = await sb.from('members').delete().eq('id', member.id);
    setLoading(false);
    if (error) {
      if (error.code === '23503' || error.message.includes('foreign key')) {
        toast('Cannot delete member. Bookings reference this member. Try deactivating instead.', 'err');
      } else {
        toast('Failed to delete member: ' + error.message, 'err');
      }
    } else {
      toast('Member deleted.', 'ok');
      load();
    }
  }

  async function handleDeleteRoom(room) {
    if (!window.confirm(`Are you sure you want to delete room "${room.name}"?`)) return;
    setLoading(true);
    const { error } = await sb.from('rooms').delete().eq('id', room.id);
    setLoading(false);
    if (error) {
      if (error.code === '23503' || error.message.includes('foreign key')) {
        toast('Cannot delete room. Bookings reference this room. Try deactivating instead.', 'err');
      } else {
        toast('Failed to delete room: ' + error.message, 'err');
      }
    } else {
      toast('Room deleted.', 'ok');
      load();
    }
  }

  return (
    <div>
      {/* Title Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Admin Management</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {activeTab === 'companies' ? (
            <>
              <button className="btn btn-primary btn-sm" onClick={() => setCreateCompanyTarget(true)}>
                + Create Company
              </button>
              <button className="btn btn-sm" onClick={() => setAddMemberCompanyId('')}>
                + Add Member
              </button>
            </>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={() => setCreateRoom(true)}>
              + Create Room
            </button>
          )}
        </div>
      </div>

      {/* Tabs sub-navigation */}
      <div className="segmented" style={{ marginBottom: 20, maxWidth: 360 }}>
        <button className={activeTab === 'companies' ? 'active' : ''} onClick={() => setActiveTab('companies')}>
          🏢 Companies & Members
        </button>
        <button className={activeTab === 'rooms' ? 'active' : ''} onClick={() => setActiveTab('rooms')}>
          🚪 Rooms
        </button>
      </div>

      {loading && <div className="empty">Loading…</div>}

      {!loading && (
        <>
          {/* Companies & Members Tab */}
          {activeTab === 'companies' && (
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
                  const membersList = c.members || [];
                  const used = c.usage?.hours_used || 0;
                  const remaining = Math.max(0, c.monthly_hours_allocation - used);
                  return (
                    <div key={c.id} className="card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15 }}>{c.name}</div>
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

                      {/* Members Section within Company */}
                      <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <strong style={{ fontSize: 12.5, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)' }}>
                            Members / Contact Persons ({membersList.length})
                          </strong>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ minHeight: '28px', height: '28px', padding: '0 8px', fontSize: '11px', border: '1px dashed var(--border-strong)' }}
                            onClick={() => setAddMemberCompanyId(c.id)}
                          >
                            + Add Member
                          </button>
                        </div>
                        {membersList.length === 0 ? (
                          <div style={{ fontSize: 12, color: 'var(--text-faint)', fontStyle: 'italic', padding: '4px 0' }}>
                            No members added to this company.
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {membersList.map(m => (
                              <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 13, fontWeight: 600 }}>{m.contact_name}</span>
                                    <Badge status={m.is_active ? 'confirmed' : 'cancelled'}>
                                      {m.is_active ? 'active' : 'inactive'}
                                    </Badge>
                                  </div>
                                  <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                                    {m.email && <span>📧 {m.email}</span>}
                                    {m.phone && <span>📞 {m.phone}</span>}
                                  </div>
                                </div>
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <button
                                    className="btn btn-sm"
                                    style={{ minHeight: '28px', height: '28px', padding: '0 8px', fontSize: '11px' }}
                                    onClick={() => setEditMember(m)}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    className="btn btn-sm btn-danger"
                                    style={{ minHeight: '28px', height: '28px', padding: '0 8px', fontSize: '11px', borderColor: 'var(--danger)', color: 'var(--danger)', background: 'transparent' }}
                                    onClick={() => handleDeleteMember(m)}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Company Actions */}
                      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                        <button className="btn btn-sm" style={{ flex: 1 }} onClick={() => setEditCompany(c)}>
                          Edit Company Details
                        </button>
                        <button className="btn btn-sm" style={{ flex: 1 }} onClick={() => toggleActive(c)}>
                          {c.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button className="btn btn-sm btn-danger" style={{ flex: 1, borderColor: 'var(--danger)', color: 'var(--danger)', background: 'transparent' }} onClick={() => handleDeleteCompany(c)}>
                          Delete Company
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Rooms Tab */}
          {activeTab === 'rooms' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {roomsList.length === 0 ? (
                <div className="card empty">
                  <p style={{ margin: '0 0 12px', fontSize: 14 }}>No rooms created yet.</p>
                  <button className="btn btn-primary btn-sm" onClick={() => setCreateRoom(true)}>
                    + Create First Room
                  </button>
                </div>
              ) : (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Room Name</th>
                          <th>Status</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {roomsList.map(r => (
                          <tr key={r.id}>
                            <td style={{ fontWeight: 600, fontSize: 14 }}>{r.name}</td>
                            <td>
                              <Badge status={r.is_active ? 'confirmed' : 'cancelled'}>
                                {r.is_active ? 'active' : 'inactive'}
                              </Badge>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: 8 }}>
                                <button className="btn btn-sm" onClick={() => setEditRoom(r)}>
                                  Edit
                                </button>
                                <button className="btn btn-sm btn-danger" style={{ borderColor: 'var(--danger)', color: 'var(--danger)', background: 'transparent' }} onClick={() => handleDeleteRoom(r)}>
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* MODALS */}

      {/* 1. Standalone / Quick Create Company */}
      {createCompanyTarget !== null && (
        <CreateCompanyModal
          pendingUser={typeof createCompanyTarget === 'object' ? createCompanyTarget : null}
          onClose={() => setCreateCompanyTarget(null)}
          onSaved={() => { setCreateCompanyTarget(null); load(); }}
        />
      )}

      {/* 2. Edit Company Details */}
      {editCompany !== null && (
        <CompanyModal
          company={editCompany}
          onClose={() => setEditCompany(null)}
          onSaved={() => { setEditCompany(null); load(); }}
        />
      )}

      {/* 3. Add or Edit Member */}
      {(addMemberCompanyId !== null || editMember !== null) && (
        <MemberModal
          member={editMember}
          companyId={addMemberCompanyId}
          companies={companies}
          onClose={() => { setAddMemberCompanyId(null); setEditMember(null); }}
          onSaved={() => { setAddMemberCompanyId(null); setEditMember(null); load(); }}
        />
      )}

      {/* 4. Create Room */}
      {createRoom && (
        <RoomModal
          room={null}
          onClose={() => setCreateRoom(false)}
          onSaved={() => { setCreateRoom(false); load(); }}
        />
      )}

      {/* 5. Edit Room */}
      {editRoom !== null && (
        <RoomModal
          room={editRoom}
          onClose={() => setEditRoom(null)}
          onSaved={() => { setEditRoom(null); load(); }}
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

/* ── Create Company Modal (Original workflow for google assigns) ── */
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

    const contactToUse = contactName.trim() || (pendingUser ? (pendingUser.full_name || 'Primary Contact') : '');
    if (contactToUse) {
      await sb.from('members').insert({
        company_id: newCo.id,
        contact_name: contactToUse,
        email: email.trim() || null,
        phone: phone.trim() || null,
        is_active: true
      });
    }

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
          <select value={allocation} onChange={e => setAllocation(Number(e.target.value))}>
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

/* ── Edit Company Modal ── */
function CompanyModal({ company, onClose, onSaved }) {
  const [companyName, setCompanyName] = useState(company?.name || '');
  const [category, setCategory]       = useState(company?.category || 'member');
  const [allocation, setAllocation]   = useState(company?.monthly_hours_allocation || 10);
  const [loginUuid, setLoginUuid]     = useState(company?.loginProfile?.id || '');
  const [isActive, setIsActive]       = useState(company ? company.is_active : true);
  const [notice, setNotice]           = useState('');
  const [loading, setLoading]         = useState(false);

  async function handleSave() {
    setNotice(''); setLoading(true);
    if (!companyName.trim()) {
      setNotice('Company name is required.'); setLoading(false); return;
    }

    const { error: e1 } = await sb.from('companies')
      .update({
        name: companyName.trim(),
        category,
        monthly_hours_allocation: Number(allocation),
        is_active: isActive
      })
      .eq('id', company.id);

    if (e1) {
      setNotice(e1.message); setLoading(false); return;
    }

    if (loginUuid.trim()) {
      const { error: e2 } = await sb.from('profiles').upsert({
        id: loginUuid.trim(),
        role: 'member',
        company_id: company.id,
        full_name: companyName.trim()
      });
      if (e2) {
        toast('Company saved, but linking login profile failed: ' + e2.message, 'err');
      }
    } else if (company.loginProfile?.id) {
      await sb.from('profiles').update({ company_id: null }).eq('id', company.loginProfile.id);
    }

    toast('Company details updated.', 'ok');
    setLoading(false);
    onSaved();
  }

  const footer = (
    <>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
        {loading ? 'Saving…' : 'Save'}
      </button>
    </>
  );

  return (
    <Modal title="Edit Company Details" onClose={onClose} footer={footer}>
      {notice && <div className="notice notice-danger"><span>⚠️</span><span>{notice}</span></div>}
      <div className="field">
        <label>Company Name *</label>
        <input
          value={companyName}
          onChange={e => setCompanyName(e.target.value)}
          autoFocus
        />
      </div>

      <div className="field-row">
        <div className="field">
          <label>Category</label>
          <select value={category} onChange={e => {
            setCategory(e.target.value);
            if (e.target.value === 'virtual_office') setAllocation(4);
          }}>
            <option value="member">Member</option>
            <option value="virtual_office">Virtual Office</option>
          </select>
        </div>
        <div className="field">
          <label>Monthly Allocation</label>
          <select value={allocation} onChange={e => setAllocation(Number(e.target.value))}>
            <option value="4">4 hours</option>
            <option value="10">10 hours</option>
            <option value="20">20 hours</option>
            <option value="40">40 hours</option>
          </select>
        </div>
      </div>

      <div className="field">
        <label>Login User UUID (optional)</label>
        <input
          value={loginUuid}
          onChange={e => setLoginUuid(e.target.value)}
          placeholder="from Supabase → Authentication → Users"
        />
      </div>

      <div className="field" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <input
          type="checkbox"
          id="company-active"
          checked={isActive}
          onChange={e => setIsActive(e.target.checked)}
          style={{ width: 'auto', minHeight: 'auto', cursor: 'pointer' }}
        />
        <label htmlFor="company-active" style={{ margin: 0, cursor: 'pointer' }}>Active Company</label>
      </div>
    </Modal>
  );
}

/* ── Add / Edit Member Modal ── */
function MemberModal({ member, companyId, companies, onClose, onSaved }) {
  const isEditing = !!member;
  const [contactName, setContactName] = useState(member?.contact_name || '');
  const [email, setEmail]             = useState(member?.email || '');
  const [phone, setPhone]             = useState(member?.phone || '');
  const [isActive, setIsActive]       = useState(member ? member.is_active : true);
  const [selectedCompanyId, setSelectedCompanyId] = useState(member?.company_id || companyId || companies[0]?.id || '');
  const [notice, setNotice]           = useState('');
  const [loading, setLoading]         = useState(false);

  async function handleSave() {
    setNotice('');
    if (!contactName.trim()) {
      setNotice('Contact person name is required.');
      return;
    }
    if (!selectedCompanyId) {
      setNotice('Company is required.');
      return;
    }
    setLoading(true);

    if (isEditing) {
      const { error } = await sb.from('members')
        .update({
          company_id: selectedCompanyId,
          contact_name: contactName.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          is_active: isActive
        })
        .eq('id', member.id);

      if (error) {
        setNotice(error.message);
        setLoading(false);
      } else {
        toast('Member updated.', 'ok');
        setLoading(false);
        onSaved();
      }
    } else {
      const { error } = await sb.from('members')
        .insert({
          company_id: selectedCompanyId,
          contact_name: contactName.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          is_active: isActive
        });

      if (error) {
        setNotice(error.message);
        setLoading(false);
      } else {
        toast('Member added.', 'ok');
        setLoading(false);
        onSaved();
      }
    }
  }

  const title = isEditing ? 'Edit Member Details' : 'Add New Member';
  const footer = (
    <>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
        {loading ? 'Saving…' : 'Save'}
      </button>
    </>
  );

  return (
    <Modal title={title} onClose={onClose} footer={footer}>
      {notice && <div className="notice notice-danger"><span>⚠️</span><span>{notice}</span></div>}

      {!companyId && !isEditing && (
        <div className="field">
          <label>Company *</label>
          <select value={selectedCompanyId} onChange={e => setSelectedCompanyId(e.target.value)}>
            {companies.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="field">
        <label>Contact Person Name *</label>
        <input
          value={contactName}
          onChange={e => setContactName(e.target.value)}
          placeholder="e.g. John Doe"
          autoFocus
        />
      </div>

      <div className="field-row">
        <div className="field">
          <label>Email (optional)</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="john@company.com"
          />
        </div>
        <div className="field">
          <label>Phone (optional)</label>
          <input
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="+1 555-0199"
          />
        </div>
      </div>

      <div className="field" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <input
          type="checkbox"
          id="member-active"
          checked={isActive}
          onChange={e => setIsActive(e.target.checked)}
          style={{ width: 'auto', minHeight: 'auto', cursor: 'pointer' }}
        />
        <label htmlFor="member-active" style={{ margin: 0, cursor: 'pointer' }}>Active Member</label>
      </div>
    </Modal>
  );
}
/* ── Add / Edit Room Modal ── */
function RoomModal({ room, onClose, onSaved }) {
  const [name, setName] = useState(room?.name || '');
  const [seats, setSeats] = useState(room?.seats ?? 10);
  const [isActive, setIsActive] = useState(room ? room.is_active : true);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    setNotice('');
    if (!name.trim()) { setNotice('Room name is required.'); return; }
    if (!seats || Number(seats) < 1) { setNotice('Seats must be at least 1.'); return; }
    setLoading(true);

    const payload = { name: name.trim(), seats: Number(seats), is_active: isActive };

    if (room) {
      const { error } = await sb.from('rooms').update(payload).eq('id', room.id);
      if (error) { setNotice(error.message); setLoading(false); }
      else { toast(`Room "${name.trim()}" updated.`, 'ok'); setLoading(false); onSaved(); }
    } else {
      const { error } = await sb.from('rooms').insert(payload);
      if (error) { setNotice(error.message); setLoading(false); }
      else { toast(`Room "${name.trim()}" created.`, 'ok'); setLoading(false); onSaved(); }
    }
  }

  const title = room ? 'Edit Room' : 'Create Room';
  const footer = (
    <>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
        {loading ? 'Saving…' : 'Save'}
      </button>
    </>
  );

  return (
    <Modal title={title} onClose={onClose} footer={footer}>
      {notice && <div className="notice notice-danger"><span>⚠️</span><span>{notice}</span></div>}

      <div className="field">
        <label>Room Name *</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Meeting Room A"
          autoFocus
        />
      </div>

      <div className="field">
        <label>Seats / Capacity *</label>
        <input
          type="number"
          min="1"
          value={seats}
          onChange={e => setSeats(e.target.value)}
          placeholder="e.g. 10"
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, marginBottom: 4 }}>
        <div
          role="switch"
          aria-checked={isActive}
          onClick={() => setIsActive(v => !v)}
          style={{
            width: 40,
            height: 22,
            borderRadius: 11,
            background: isActive ? 'var(--accent)' : 'var(--border-strong)',
            position: 'relative',
            cursor: 'pointer',
            transition: 'background .2s',
            flexShrink: 0,
          }}
        >
          <div style={{
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: '#fff',
            position: 'absolute',
            top: 3,
            left: isActive ? 21 : 3,
            transition: 'left .2s',
            boxShadow: '0 1px 3px rgba(0,0,0,.25)',
          }} />
        </div>
        <span
          style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', cursor: 'pointer', userSelect: 'none' }}
          onClick={() => setIsActive(v => !v)}
        >
          {isActive ? 'Active — available for bookings' : 'Inactive — hidden from booking'}
        </span>
      </div>
    </Modal>
  );
}
