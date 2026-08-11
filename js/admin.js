import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
let teams = [], pools = [], fixtures = [];
const q = selector => document.querySelector(selector);
const teamName = id => teams.find(t => t.id === id)?.name || 'TBC';

async function checkSession() {
  const { data } = await db.auth.getSession();
  if (data.session) await enter();
  else q('#login-card').classList.remove('hidden');
}

q('#login').onclick = async () => {
  q('#login-msg').textContent = 'Signing in…';
  const { error } = await db.auth.signInWithPassword({
    email: q('#email').value,
    password: q('#password').value
  });
  if (error) {
    q('#login-msg').textContent = error.message;
    return;
  }
  await enter();
};

q('#logout').onclick = async () => {
  await db.auth.signOut();
  location.reload();
};

async function enter() {
  const { data: admin, error } = await db.from('joi_admins').select('*').maybeSingle();
  if (error || !admin) {
    await db.auth.signOut();
    q('#login-msg').textContent = 'This account is not listed as a Junior JOI administrator.';
    return;
  }

  q('#login-card').classList.add('hidden');
  q('#dashboard').classList.remove('hidden');
  await load();
}

async function load() {
  const [t, p, f, a] = await Promise.all([
    db.from('joi_teams').select('*').order('name'),
    db.from('joi_pools').select('*'),
    db.from('joi_fixtures').select('*').order('match_date').order('match_time'),
    db.from('joi_announcements').select('*').eq('is_active', true).order('created_at', { ascending: false }).limit(1)
  ]);

  teams = t.data || [];
  pools = p.data || [];
  fixtures = f.data || [];

  fillSelects();
  q('#announcement-message').value = a.data?.[0]?.message || '';
  render();
}

function fillSelects() {
  const teamOptions = '<option value="">TBC</option>' + teams.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  q('#home-team').innerHTML = teamOptions;
  q('#away-team').innerHTML = teamOptions;
  q('#pool').innerHTML = '<option value="">No pool</option>' + pools.map(p => `<option value="${p.id}">${p.division} ${p.name}</option>`).join('');
}

q('#save-announcement').onclick = async () => {
  await db.from('joi_announcements').update({ is_active: false }).eq('is_active', true);
  const { error } = await db.from('joi_announcements').insert({
    message: q('#announcement-message').value,
    is_active: true
  });
  alert(error ? error.message : 'Announcement published');
};

q('#save-fixture').onclick = async () => {
  const payload = {
    division: q('#division').value,
    game_number: +q('#game-number').value,
    match_date: q('#match-date').value,
    match_time: q('#match-time').value,
    venue: q('#venue').value,
    pool_id: q('#pool').value || null,
    home_team_id: q('#home-team').value || null,
    away_team_id: q('#away-team').value || null,
    home_score: q('#home-score').value === '' ? null : +q('#home-score').value,
    away_score: q('#away-score').value === '' ? null : +q('#away-score').value,
    status: q('#status').value,
    stage: q('#stage').value || 'Pool',
    notes: q('#notes').value || null
  };

  if (!payload.game_number || !payload.match_time) {
    alert('Game number and time are required.');
    return;
  }

  const id = q('#fixture-id').value;
  const result = id
    ? await db.from('joi_fixtures').update(payload).eq('id', id)
    : await db.from('joi_fixtures').insert(payload);

  if (result.error) {
    alert(result.error.message);
    return;
  }

  clearForm();
  await load();
};

function clearForm() {
  ['fixture-id', 'game-number', 'match-time', 'home-score', 'away-score', 'notes'].forEach(id => q('#' + id).value = '');
  q('#status').value = 'Scheduled';
  q('#stage').value = 'Pool';
}

q('#clear-form').onclick = clearForm;

function render() {
  q('#admin-fixtures').innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>GN</th><th>Date</th><th>Time</th><th>Home</th><th>Score</th><th>Away</th><th>Venue</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>${fixtures.map(f => `<tr>
      <td>${f.game_number}</td><td>${f.match_date}</td><td>${f.match_time.slice(0,5)}</td>
      <td>${teamName(f.home_team_id)}</td><td>${f.home_score ?? '-'} - ${f.away_score ?? '-'}</td>
      <td>${teamName(f.away_team_id)}</td><td>${f.venue}</td><td>${f.status}</td>
      <td><button class="btn btn-dark edit" data-id="${f.id}">Edit</button> <button class="btn btn-danger del" data-id="${f.id}">Delete</button></td>
    </tr>`).join('')}</tbody>
  </table></div>`;

  document.querySelectorAll('.edit').forEach(button => button.onclick = () => editFixture(button.dataset.id));
  document.querySelectorAll('.del').forEach(button => button.onclick = () => removeFixture(button.dataset.id));
}

function editFixture(id) {
  const f = fixtures.find(x => x.id === id);
  const values = {
    'fixture-id': f.id,
    'division': f.division,
    'game-number': f.game_number,
    'match-date': f.match_date,
    'match-time': f.match_time.slice(0,5),
    'venue': f.venue,
    'pool': f.pool_id || '',
    'home-team': f.home_team_id || '',
    'away-team': f.away_team_id || '',
    'home-score': f.home_score ?? '',
    'away-score': f.away_score ?? '',
    'status': f.status,
    'stage': f.stage,
    'notes': f.notes || ''
  };

  for (const [id, value] of Object.entries(values)) q('#' + id).value = value;
  scrollTo({ top: 300, behavior: 'smooth' });
}

async function removeFixture(id) {
  if (!confirm('Delete this fixture?')) return;
  const { error } = await db.from('joi_fixtures').delete().eq('id', id);
  if (error) alert(error.message);
  else await load();
}

checkSession();
