import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

let fixtures = [];
let teams = [];
let pools = [];
let rankings = [];

/*
  School badge sources:
  - Where a clean direct crest image was readily available, it is used directly.
  - For the remaining schools, the website uses the icon published for that
    school's verified official website through Google's favicon service.
  - If any remote image ever fails, the coloured initials appear automatically.
*/
const SCHOOL_BADGES = {
  MC: 'https://premierinterschools.co.za/wp-content/uploads/2018/03/maritzburg-college-emblem-square-logo.png',
  WBHS: 'https://www.wbhs.co.za/wp-content/uploads/2019/08/WBHS_Badge-768x768.png',
  PBHS: 'https://www.google.com/s2/favicons?domain_url=https://boyshigh.com&sz=128',
  KWC: 'https://www.google.com/s2/favicons?domain_url=https://kingswoodcollege.com&sz=128',
  HC: 'https://www.google.com/s2/favicons?domain_url=https://hiltoncollege.com&sz=128',
  GW: 'https://static.wixstatic.com/media/409b40_2bdac5365d5641108c977842c23d4494~mv2.png/v1/fill/w_300,h_360,al_c,q_90/Glenwood%20Logo%20FOR%20DARK%20BACKGROUND_PNG.png',
  ESCA: 'https://www.google.com/s2/favicons?domain_url=https://esca.org.za&sz=128',
  BC: 'https://www.google.com/s2/favicons?domain_url=https://www.bishops.org.za&sz=128',
  SCC: 'https://www.google.com/s2/favicons?domain_url=https://www.stcharlescollege.co.za&sz=128',
  DHS: 'https://www.google.com/s2/favicons?domain_url=https://www.durbanhighschool.co.za&sz=128',
  SJC: 'https://www.google.com/s2/favicons?domain_url=https://www.stjohnscollege.co.za&sz=128',
  EC: 'https://www.google.com/s2/favicons?domain_url=https://www.ethamcollege.co.za&sz=128',
  KC: 'https://www.google.com/s2/favicons?domain_url=https://www.kearsney.com&sz=128',
  MHS: 'https://www.google.com/s2/favicons?domain_url=https://www.michaelhouse.org&sz=128',
  SD: 'https://www.google.com/s2/favicons?domain_url=https://www.stdavids.co.za&sz=128',
  PHS: 'https://cdn.24.co.za/files/Cms/General/d/10866/649a78600dce4e03bf33958f4ba63073.jpg',
  SACS: 'https://www.google.com/s2/favicons?domain_url=https://sacshigh.org.za&sz=128',
  SN: 'https://www.google.com/s2/favicons?domain_url=https://www.stnicholas.co.za&sz=128',
  MK: 'https://www.google.com/s2/favicons?domain_url=https://www.curro.co.za/schools/meridian-karino-high-school/&sz=128'
};

const FALLBACK_COLOURS = {
  MC:'#d10b18', WBHS:'#233851', PBHS:'#174b9b', KWC:'#8a2323',
  HC:'#153e88', GW:'#0b6038', ESCA:'#e48b12', BC:'#6e1d36',
  SCC:'#2553a3', DHS:'#183c72', SJC:'#72323c', EC:'#df7a11',
  KC:'#a8292d', MHS:'#383838', SD:'#1e4b8c', PHS:'#284d7b',
  SACS:'#163c7a', SN:'#7c3157', MK:'#1d6f55'
};

const teamObj = id => teams.find(t => t.id === id);
const teamName = id => teamObj(id)?.name || 'TBC';
const shortName = id => teamObj(id)?.short_name || 'TBC';
const poolName = id => pools.find(p => p.id === id)?.name || '';
const fmtTime = t => t ? t.slice(0,5) : '';
const fmtDate = d => d
  ? new Date(d + 'T00:00:00').toLocaleDateString('en-ZA',{day:'numeric',month:'short',year:'numeric'})
  : '';

function badge(id, large = false) {
  const code = shortName(id);
  if (!id || code === 'TBC') {
    return `<span class="school-badge-shell ${large ? 'large' : ''}">
      <span class="school-badge-fallback" style="background:#555">?</span>
    </span>`;
  }

  const src = SCHOOL_BADGES[code];
  const colour = FALLBACK_COLOURS[code] || '#555';

  return `<span class="school-badge-shell ${large ? 'large' : ''}">
    <img class="school-badge-img"
         src="${src}"
         alt="${teamName(id)} badge"
         loading="lazy"
         referrerpolicy="no-referrer"
         onload="this.nextElementSibling.style.display='none'"
         onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
    <span class="school-badge-fallback" style="background:${colour}">${code}</span>
  </span>`;
}

async function load() {
  const [f,t,p,a,r] = await Promise.all([
    db.from('joi_fixtures').select('*').order('match_date').order('match_time'),
    db.from('joi_teams').select('*').order('name'),
    db.from('joi_pools').select('*'),
    db.from('joi_announcements').select('*').eq('is_active',true).order('created_at',{ascending:false}).limit(1),
    db.from('joi_rankings').select('*').order('division').order('position')
  ]);

  if (f.error) {
    document.querySelector('#announcement').textContent = 'Configuration error: ' + f.error.message;
    return;
  }

  fixtures = f.data || [];
  teams = t.data || [];
  pools = p.data || [];
  rankings = r.data || [];

  document.querySelector('#announcement').textContent =
    a.data?.[0]?.message || 'Welcome to Junior JOI 2026';

  renderAll();
}

function calculateStandings(poolId) {
  const rows = {};

  fixtures
    .filter(f =>
      f.pool_id === poolId &&
      f.status === 'Completed' &&
      f.home_team_id &&
      f.away_team_id &&
      Number.isFinite(f.home_score) &&
      Number.isFinite(f.away_score)
    )
    .forEach(f => {
      [f.home_team_id, f.away_team_id].forEach(id => {
        rows[id] ??= {id,p:0,w:0,l:0,pf:0,pa:0,pts:0};
      });

      const h = rows[f.home_team_id];
      const a = rows[f.away_team_id];

      h.p++; a.p++;
      h.pf += f.home_score; h.pa += f.away_score;
      a.pf += f.away_score; a.pa += f.home_score;

      if (f.home_score > f.away_score) {
        h.w++; a.l++; h.pts += 2; a.pts += 1;
      } else if (f.away_score > f.home_score) {
        a.w++; h.l++; a.pts += 2; h.pts += 1;
      } else {
        h.pts += 1; a.pts += 1;
      }
    });

  return Object.values(rows).sort((a,b) =>
    b.pts - a.pts ||
    ((b.pf-b.pa) - (a.pf-a.pa)) ||
    b.pf - a.pf
  );
}

function fixtureRow(f) {
  return `<tr>
    <td>${f.game_number}</td>
    <td>${fmtDate(f.match_date)}</td>
    <td><strong>${fmtTime(f.match_time)}</strong></td>
    <td><span class="table-team">${badge(f.home_team_id)}<span>${teamName(f.home_team_id)}</span></span></td>
    <td class="table-score">${f.home_score ?? '-'} - ${f.away_score ?? '-'}</td>
    <td><span class="table-team">${badge(f.away_team_id)}<span>${teamName(f.away_team_id)}</span></span></td>
    <td>${f.venue}</td>
    <td>${f.division} ${poolName(f.pool_id)}</td>
    <td><span class="status ${f.status}">${f.status}</span></td>
  </tr>`;
}

function table(data) {
  return `<div class="table-wrap">
    <table>
      <thead>
        <tr><th>GN</th><th>Date</th><th>Time</th><th>Home</th><th>Score</th><th>Away</th><th>Venue</th><th>Group</th><th>Status</th></tr>
      </thead>
      <tbody>${data.map(fixtureRow).join('') || '<tr><td colspan="9">No matches found.</td></tr>'}</tbody>
    </table>
  </div>`;
}

function renderAll() {
  const upcoming = fixtures.filter(f => f.status === 'Scheduled').slice(0,4);

  document.querySelector('#upcoming').innerHTML =
    upcoming.map(f => `
      <div class="item fixture-card-row">
        <div class="time-pill">${fmtTime(f.match_time)}</div>

        <div class="fixture-team">
          ${badge(f.home_team_id, true)}
          <span class="team-name">${teamName(f.home_team_id)}</span>
        </div>

        <div class="vs">VS</div>

        <div class="fixture-team away">
          ${badge(f.away_team_id, true)}
          <span class="team-name">${teamName(f.away_team_id)}</span>
        </div>

        <div class="match-chip">${f.division} • ${f.venue}</div>
      </div>
    `).join('') || '<div class="empty-state">Fixtures will appear here.</div>';

  const done = fixtures.filter(f => f.status === 'Completed').slice(-4).reverse();

  document.querySelector('#latest-results').innerHTML =
    done.map(f => `
      <div class="item result-card-row">
        <div class="result-team">
          ${badge(f.home_team_id, true)}
          <span class="team-name">${teamName(f.home_team_id)}</span>
        </div>

        <div class="result-score">
          <span class="score-box score-home">${f.home_score}</span>
          <strong>–</strong>
          <span class="score-box score-away">${f.away_score}</span>
        </div>

        <div class="result-team away">
          ${badge(f.away_team_id, true)}
          <span class="team-name">${teamName(f.away_team_id)}</span>
        </div>

        <div class="match-chip">${f.division} • ${poolName(f.pool_id) || f.stage}</div>
      </div>
    `).join('') || '<div class="empty-state">Results will appear here.</div>';

  const firstPool = pools.find(p => p.division === 'U15' && p.name === 'Pool A') || pools[0];
  const top = firstPool ? calculateStandings(firstPool.id).slice(0,4) : [];

  document.querySelector('#home-standings').innerHTML = `
    <div class="standing-row standing-head">
      <span>#</span><span>TEAM</span><span>P</span><span>W</span><span>PD</span><span>PTS</span>
    </div>
    ${top.map((x,i) => `
      <div class="standing-row">
        <span>${i+1}</span>
        <span class="standing-team">${badge(x.id)}<span>${teamName(x.id)}</span></span>
        <span>${x.p}</span>
        <span>${x.w}</span>
        <span>${x.pf-x.pa > 0 ? '+' : ''}${x.pf-x.pa}</span>
        <strong>${x.pts}</strong>
      </div>
    `).join('') || '<div class="empty-state">Standings will appear after completed games.</div>'}`;

  document.querySelector('#home-rankings').innerHTML =
    [1,2,3,4,5,6].map(pos => {
      const r = rankings.find(x => x.position === pos && x.division === 'U15');
      const cls = pos===1 ? 'gold' : pos===2 ? 'silver' : pos===3 ? 'bronze' : 'black-medal';

      return `<div class="rank-row">
        <span class="medal ${cls}">${pos}</span>
        <span class="ranking-school">
          ${r?.team_id ? badge(r.team_id) : ''}
          <strong>${r?.team_id ? teamName(r.team_id) : (r?.label || 'To be decided')}</strong>
        </span>
      </div>`;
    }).join('');

  renderFixtures();

  document.querySelector('#results-table').innerHTML =
    table(fixtures.filter(f => f.status === 'Completed'));

  document.querySelector('#standings-content').innerHTML =
    pools
      .sort((a,b) => a.division.localeCompare(b.division) || a.name.localeCompare(b.name))
      .map(pool => {
        const rows = calculateStandings(pool.id);
        return `<div class="card card-green standings-full-card">
          <h3>${pool.division} ${pool.name}</h3>
          <div class="card-body">
            <div class="standing-row standing-head">
              <span>#</span><span>TEAM</span><span>P</span><span>W</span><span>PD</span><span>PTS</span>
            </div>
            ${rows.map((x,i) => `
              <div class="standing-row">
                <span>${i+1}</span>
                <span class="standing-team">${badge(x.id)}<span>${teamName(x.id)}</span></span>
                <span>${x.p}</span><span>${x.w}</span>
                <span>${x.pf-x.pa > 0 ? '+' : ''}${x.pf-x.pa}</span>
                <strong>${x.pts}</strong>
              </div>`).join('') || '<div class="empty-state">No completed pool games yet.</div>'}
          </div>
        </div>`;
      }).join('');

  document.querySelector('#rankings-content').innerHTML =
    ['U14','U15'].map(d => `
      <div class="card card-purple rankings-full-card">
        <h3>${d} Final Rankings</h3>
        <div class="card-body">
          ${[1,2,3,4,5,6].map(pos => {
            const r = rankings.find(x => x.division === d && x.position === pos);
            const cls = pos===1 ? 'gold' : pos===2 ? 'silver' : pos===3 ? 'bronze' : 'black-medal';
            return `<div class="rank-row">
              <span class="medal ${cls}">${pos}</span>
              <span class="ranking-school">
                ${r?.team_id ? badge(r.team_id) : ''}
                <strong>${r?.team_id ? teamName(r.team_id) : (r?.label || 'To be decided')}</strong>
              </span>
            </div>`;
          }).join('')}
        </div>
      </div>
    `).join('');
}

function renderFixtures() {
  let data = [...fixtures];

  const division = document.querySelector('#filter-division').value;
  const date = document.querySelector('#filter-date').value;
  const venue = document.querySelector('#filter-venue').value;
  const search = document.querySelector('#filter-search').value.toLowerCase();

  if (division) data = data.filter(x => x.division === division);
  if (date) data = data.filter(x => x.match_date === date);
  if (venue) data = data.filter(x => x.venue === venue);
  if (search) {
    data = data.filter(x =>
      (teamName(x.home_team_id) + ' ' + teamName(x.away_team_id))
        .toLowerCase()
        .includes(search)
    );
  }

  document.querySelector('#fixtures-table').innerHTML = table(data);
}

document.querySelectorAll('.nav button').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.nav button').forEach(x => x.classList.remove('active'));
    button.classList.add('active');

    document.querySelectorAll('.page').forEach(page => {
      page.classList.toggle('active', page.id === button.dataset.page);
    });

    document.querySelector('#main-nav')?.classList.remove('open');
  });
});

document.querySelector('#menu-toggle')?.addEventListener('click', () => {
  document.querySelector('#main-nav')?.classList.toggle('open');
});

document.querySelectorAll('[data-goto]').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelector(`.nav button[data-page="${button.dataset.goto}"]`)?.click();
  });
});

['filter-division','filter-date','filter-venue','filter-search'].forEach(id => {
  document.querySelector('#'+id)?.addEventListener('input', renderFixtures);
});

db.channel('joi-public')
  .on('postgres_changes',{event:'*',schema:'public',table:'joi_fixtures'},load)
  .on('postgres_changes',{event:'*',schema:'public',table:'joi_announcements'},load)
  .subscribe();

load();
