#!/usr/bin/env node
/**
 * Generates every SVG asset of the profile (terminal / neon theme),
 * in a light and a dark variant, from live GitHub data.
 *
 *   node scripts/generate.mjs
 *
 * Falls back to the last known numbers if the API is unreachable,
 * so the assets are never regenerated empty.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets');
mkdirSync(OUT, { recursive: true });

const USER = 'Smeagolworms4';
const ORGS = ['GollumSF', 'GollumJS', 'GollumDom', 'GollumTeam'];
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

/* ------------------------------------------------------------------ data -- */

async function api(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'smeagolworms4-profile-generator',
      ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

async function allRepos(path) {
  const out = [];
  for (let page = 1; page <= 4; page++) {
    const batch = await api(`${path}?per_page=100&page=${page}`);
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

const FALLBACK = {
  repos: 75,
  stars: 178,
  followers: 15,
  packages: 42,
  since: 2013,
  languages: [
    ['PHP', 30], ['TypeScript', 24], ['JavaScript', 20],
    ['Java', 12], ['Python', 6], ['Shell', 5],
  ],
};

async function collect() {
  try {
    const user = await api(`/users/${USER}`);
    const mine = await allRepos(`/users/${USER}/repos`);
    const orgRepos = (await Promise.all(ORGS.map((o) => allRepos(`/orgs/${o}/repos`)))).flat();
    const all = [...mine, ...orgRepos];

    const langCount = new Map();
    for (const r of all) {
      if (r.fork || !r.language) continue;
      langCount.set(r.language, (langCount.get(r.language) || 0) + 1);
    }

    return {
      repos: user.public_repos,
      stars: all.reduce((n, r) => n + r.stargazers_count, 0),
      followers: user.followers,
      packages: orgRepos.length,
      since: new Date(user.created_at).getFullYear(),
      languages: [...langCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
    };
  } catch (err) {
    console.warn(`! GitHub API unavailable (${err.message}) — using fallback numbers`);
    return FALLBACK;
  }
}

const FALLBACK_POSTS = [
  { date: '2026-08-12', cat: 'Technos', title: 'CrowdSec : protéger vos sites et applications web' },
  { date: '2026-08-11', cat: 'Programmation', title: 'Auto Makefile : un Makefile cross projets automatisé' },
  { date: '2026-08-10', cat: 'Technos', title: 'Komga : vos eBooks, mangas et comics à portée de clic' },
  { date: '2026-08-09', cat: 'Réalisations', title: 'IP Info : géolocaliser une adresse IP' },
  { date: '2026-08-08', cat: 'Technos', title: 'Beszel : supervisez vos serveurs Docker' },
];

const MONTHS = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
                 Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };

const unwrap = (v) => v.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#8217;|&rsquo;/g, '’').replace(/&nbsp;/g, ' ').trim();

/** The five latest posts of smea.tech, straight from the RSS feed. */
async function collectPosts() {
  try {
    const res = await fetch('https://smea.tech/feed/', {
      headers: { 'user-agent': 'smeagolworms4-profile-generator' },
    });
    if (!res.ok) throw new Error(`feed -> ${res.status}`);
    const xml = await res.text();
    const posts = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 5).map((m) => {
      const item = m[1];
      const pick = (tag) => (item.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`)) || [, ''])[1];
      const raw = pick('pubDate').match(/(\d{1,2}) (\w{3}) (\d{4})/);
      return {
        title: unwrap(pick('title')),
        cat: unwrap(([...item.matchAll(/<category>([\s\S]*?)<\/category>/g)][0] || [, ''])[1]),
        date: raw ? `${raw[3]}-${MONTHS[raw[2]] || '01'}-${String(raw[1]).padStart(2, '0')}` : '',
      };
    });
    if (!posts.length) throw new Error('empty feed');
    return posts;
  } catch (err) {
    console.warn(`! smea.tech feed unavailable (${err.message}) — using fallback posts`);
    return FALLBACK_POSTS;
  }
}

/* ----------------------------------------------------------------- theme -- */

const THEMES = {
  dark: {
    id: 'dark',
    page: '#0a0e14',
    panel: '#0d1117',
    bar: '#151b23',
    border: '#243040',
    text: '#e6edf3',
    dim: '#7d8590',
    faint: '#1d2632',
    green: '#00e5a0',
    cyan: '#4cc4ff',
    pink: '#f778ba',
    amber: '#f0b429',
    red: '#ff6b6b',
    glow: 0.5,
    neon: true,
  },
  light: {
    id: 'light',
    page: '#ffffff',
    panel: '#f6f8fa',
    bar: '#eaeef2',
    border: '#d0d7de',
    text: '#111820',
    dim: '#5b6673',
    faint: '#e3e8ee',
    green: '#0c8f6c',
    cyan: '#0969da',
    pink: '#bf3989',
    amber: '#9a6700',
    red: '#cf222e',
    glow: 0.14,
    neon: false,
  },
};

const MONO = "ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,'DejaVu Sans Mono',monospace";
const W = 1200;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const cw = (size) => size * 0.6; // monospace advance width

const LANG_COLORS = {
  PHP: '#8892bf', TypeScript: '#3178c6', JavaScript: '#f1e05a', Java: '#b07219',
  Python: '#3572a5', Shell: '#89e051', 'C++': '#f34b7d', Vue: '#41b883',
  HTML: '#e34c26', CSS: '#563d7c', Kotlin: '#a97bff', Dockerfile: '#384d54',
  Makefile: '#427819', Handlebars: '#f7931e', Lua: '#000080', Go: '#00add8',
};

/* -------------------------------------------------------------- fragments -- */

function defs(t, extra = '') {
  return `<defs>
    <radialGradient id="halo" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${t.green}" stop-opacity="${t.glow * 0.55}"/>
      <stop offset="55%" stop-color="${t.cyan}" stop-opacity="${t.glow * 0.16}"/>
      <stop offset="100%" stop-color="${t.cyan}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="rule" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${t.green}" stop-opacity="0"/>
      <stop offset="18%" stop-color="${t.green}" stop-opacity="0.9"/>
      <stop offset="55%" stop-color="${t.cyan}" stop-opacity="0.7"/>
      <stop offset="100%" stop-color="${t.pink}" stop-opacity="0"/>
    </linearGradient>
    <pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse">
      <circle cx="1.5" cy="1.5" r="1.1" fill="${t.border}" fill-opacity="0.55"/>
    </pattern>
    <filter id="soft" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="9"/>
    </filter>
    ${extra}
  </defs>`;
}

/** Terminal window chrome: title bar with traffic lights + a tab label. */
function chrome(t, h, title, badge = '') {
  const r = 14;
  const barH = 46;
  const topBar =
    `M0,${r} A${r},${r} 0 0 1 ${r},0 H${W - r} A${r},${r} 0 0 1 ${W},${r} V${barH} H0 Z`;
  const tw = cw(14) * title.length;
  return `
  <rect x="0.5" y="0.5" width="${W - 1}" height="${h - 1}" rx="${r}" fill="${t.panel}" stroke="${t.border}"/>
  <path d="${topBar}" fill="${t.bar}"/>
  <line x1="0" y1="${barH}" x2="${W}" y2="${barH}" stroke="${t.border}"/>
  <circle cx="26" cy="23" r="6" fill="${t.red}" fill-opacity="0.85"/>
  <circle cx="48" cy="23" r="6" fill="${t.amber}" fill-opacity="0.85"/>
  <circle cx="70" cy="23" r="6" fill="${t.green}" fill-opacity="0.85"/>
  <text x="${(W - tw) / 2}" y="28" font-family="${MONO}" font-size="14" fill="${t.dim}">${esc(title)}</text>
  ${badge ? `<text x="${W - 26}" y="28" text-anchor="end" font-family="${MONO}" font-size="13" fill="${t.dim}" opacity="0.7">${esc(badge)}</text>` : ''}`;
}

/** `$ command` prompt line. */
function prompt(t, x, y, cmd, size = 16) {
  return `<text x="${x}" y="${y}" font-family="${MONO}" font-size="${size}">
    <tspan fill="${t.green}" font-weight="600">$</tspan><tspan fill="${t.text}" opacity="0.82"> ${esc(cmd)}</tspan>
  </text>`;
}

function cursor(t, x, y, size = 16) {
  return `<rect x="${x}" y="${y - size + 3}" width="${cw(size)}" height="${size}" fill="${t.green}" rx="1">
    <animate attributeName="opacity" values="1;1;0;0" dur="1.15s" repeatCount="indefinite" calcMode="discrete"/>
  </rect>`;
}

function svg(h, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${h}" width="${W}" height="${h}" role="img">
${body}
</svg>
`;
}

/* ---------------------------------------------------------------- banner -- */

function banner(t) {
  const h = 412;
  const name = 'DAMIEN  DUBOEUF';
  const rows = [
    ['role', 'Backend & front-end engineer — freelance, remote'],
    ['stack', 'Symfony · NestJS · Vue · React · Angular · Docker · MQTT'],
    ['orgs', 'GollumSF · GollumJS · GollumDom · GollumTeam'],
    ['blog', 'smea.tech — homelab, self-hosting, home automation'],
    ['github', 'github.com/Smeagolworms4'],
  ];
  const neon = t.neon
    ? `<text x="40" y="146" font-family="${MONO}" font-size="44" font-weight="700" letter-spacing="1.5"
         fill="${t.green}" opacity="0.55" filter="url(#soft)">${esc(name)}</text>`
    : '';
  return svg(h, `${defs(t)}
  ${chrome(t, h, 'smeagolworms4@home: ~/works', 'zsh')}
  <g clip-path="inset(46px 1px 1px 1px round 0 0 14px 14px)">
    <rect x="0" y="46" width="${W}" height="${h - 46}" fill="url(#dots)" opacity="0.5"/>
    <circle cx="1032" cy="196" r="190" fill="url(#halo)"/>
    <g fill="none" stroke-width="1">
      <circle cx="1032" cy="196" r="118" stroke="${t.green}" stroke-opacity="0.20"/>
      <circle cx="1032" cy="196" r="86"  stroke="${t.cyan}"  stroke-opacity="0.16"/>
      <circle cx="1032" cy="196" r="54"  stroke="${t.green}" stroke-opacity="0.12"/>
      <circle cx="1032" cy="196" r="150" stroke="${t.green}" stroke-opacity="0.35" stroke-dasharray="2 9" stroke-linecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 1032 196" to="360 1032 196" dur="72s" repeatCount="indefinite"/>
      </circle>
    </g>
  </g>
  ${prompt(t, 40, 88, 'whoami')}
  ${neon}
  <text x="40" y="146" font-family="${MONO}" font-size="44" font-weight="700" letter-spacing="1.5" fill="${t.text}">${esc(name)}</text>
  <rect x="40" y="164" width="118" height="2" fill="url(#rule)"/>
  ${prompt(t, 40, 210, 'cat ~/.profile')}
  ${rows.map(([k, v], i) => `
  <text x="40" y="${244 + i * 28}" font-family="${MONO}" font-size="16" fill="${t.cyan}">${esc(k)}</text>
  <text x="118" y="${244 + i * 28}" font-family="${MONO}" font-size="16" fill="${t.text}" opacity="0.9">${esc(v)}</text>`).join('')}
  <text x="40" y="382" font-family="${MONO}" font-size="16" fill="${t.green}" font-weight="600">$</text>
  ${cursor(t, 58, 382)}`);
}

/* ----------------------------------------------------------------- stack -- */

const STACK = [
  ['backend ', ['PHP', 'Symfony', 'Doctrine', 'Node', 'NestJS', 'API REST', 'MySQL', 'Redis']],
  ['frontend', ['TypeScript', 'Vue', 'React', 'Angular', 'Vuetify', 'SCSS', 'Webpack', 'Babylon.js']],
  ['infra   ', ['Docker', 'Nginx', 'Traefik', 'GitLab CI', 'Debian', 'Bash', 'Make']],
  ['iot     ', ['MQTT', 'Home Assistant', 'ESPHome', 'Arduino', 'C++', 'Zigbee', 'Raspberry Pi']],
];

function stack(t) {
  const rowH = 46;
  const top = 118;
  const h = top + (STACK.length - 1) * rowH + 44;
  const accents = [t.cyan, t.green, t.amber, t.pink];

  const rows = STACK.map(([label, chips], r) => {
    const y = top + r * rowH;
    let x = 178;
    const parts = chips.map((c, i) => {
      const w = cw(14) * c.length + 26;
      const chip = `
      <g>
        <rect x="${x}" y="${y - 20}" width="${w}" height="28" rx="14"
              fill="${accents[r]}" fill-opacity="${t.neon ? 0.1 : 0.09}"
              stroke="${accents[r]}" stroke-opacity="${t.neon ? 0.45 : 0.35}"/>
        <text x="${x + 13}" y="${y - 1}" font-family="${MONO}" font-size="14" fill="${t.text}" opacity="0.95">${esc(c)}</text>
      </g>`;
      x += w + 10;
      return chip;
    }).join('');
    return `
    <text x="40" y="${y - 1}" font-family="${MONO}" font-size="14" fill="${t.dim}">${esc(label)}</text>
    <text x="152" y="${y - 1}" font-family="${MONO}" font-size="14" fill="${accents[r]}" opacity="0.8">›</text>
    ${parts}`;
  }).join('');

  return svg(h, `${defs(t)}
  ${chrome(t, h, 'smeagolworms4@home: ~/works', 'stack')}
  <rect x="0" y="46" width="${W}" height="${h - 47}" fill="url(#dots)" opacity="0.35"/>
  ${prompt(t, 40, 88, 'ls --group stack/')}
  ${rows}`);
}

/* ----------------------------------------------------------------- pulse -- */

function pulse(t, s) {
  const h = 278;
  const tiles = [
    ['public repos', String(s.repos), t.green],
    ['stars earned', String(s.stars), t.amber],
    ['followers', String(s.followers), t.cyan],
    ['org packages', String(s.packages), t.pink],
    ['shipping since', String(s.since), t.green],
  ];
  const gap = 18;
  const tw = (W - 80 - gap * (tiles.length - 1)) / tiles.length;
  const tileSvg = tiles.map(([label, value, color], i) => {
    const x = 40 + i * (tw + gap);
    return `
    <g>
      <rect x="${x}" y="106" width="${tw}" height="86" rx="10"
            fill="${color}" fill-opacity="${t.neon ? 0.07 : 0.06}" stroke="${color}" stroke-opacity="0.3"/>
      <text x="${x + tw / 2}" y="152" text-anchor="middle" font-family="${MONO}" font-size="34" font-weight="700" fill="${t.text}">${esc(value)}</text>
      <text x="${x + tw / 2}" y="176" text-anchor="middle" font-family="${MONO}" font-size="12.5" fill="${t.dim}">${esc(label)}</text>
    </g>`;
  }).join('');

  const total = s.languages.reduce((n, [, c]) => n + c, 0) || 1;
  let lx = 40;
  const bar = s.languages.map(([lang, count]) => {
    const w = ((W - 80) * count) / total;
    const seg = `<rect x="${lx}" y="216" width="${Math.max(w - 3, 2)}" height="10" rx="5" fill="${LANG_COLORS[lang] || t.dim}"/>`;
    lx += w;
    return seg;
  }).join('');

  let kx = 40;
  const keys = s.languages.map(([lang]) => {
    const label = `<g><circle cx="${kx + 5}" cy="${248}" r="5" fill="${LANG_COLORS[lang] || t.dim}"/><text x="${kx + 17}" y="${252}" font-family="${MONO}" font-size="12.5" fill="${t.dim}">${esc(lang)}</text></g>`;
    kx += 17 + cw(12.5) * lang.length + 24;
    return label;
  }).join('');

  return svg(h, `${defs(t)}
  ${chrome(t, h, 'smeagolworms4@home: ~/works', 'stats')}
  <rect x="0" y="46" width="${W}" height="${h - 47}" fill="url(#dots)" opacity="0.35"/>
  ${prompt(t, 40, 88, 'gh api /users/smeagolworms4 --pulse')}
  ${tileSvg}
  ${bar}
  ${keys}`);
}

/* ------------------------------------------------------------------ blog -- */

function blog(t, posts) {
  const rowH = 34;
  const top = 132;
  const h = top + (posts.length - 1) * rowH + 42;
  const catColor = {
    Technos: t.cyan, Programmation: t.green,
    'Réalisations': t.amber, Domotique: t.pink,
  };

  const rows = posts.map((post, i) => {
    const y = top + i * rowH;
    const color = catColor[post.cat] || t.dim;
    const label = post.cat || '—';
    const cw13 = cw(13) * label.length + 22;
    const title = post.title.length > 58 ? `${post.title.slice(0, 57)}…` : post.title;
    return `
    <text x="40" y="${y}" font-family="${MONO}" font-size="14" fill="${t.dim}">${esc(post.date)}</text>
    <rect x="150" y="${y - 15}" width="${cw13}" height="21" rx="10.5"
          fill="${color}" fill-opacity="${t.neon ? 0.12 : 0.1}" stroke="${color}" stroke-opacity="0.4"/>
    <text x="${161}" y="${y}" font-family="${MONO}" font-size="13" fill="${color}">${esc(label)}</text>
    <text x="310" y="${y}" font-family="${MONO}" font-size="15" fill="${t.text}" opacity="0.95">${esc(title)}</text>`;
  }).join('');

  return svg(h, `${defs(t)}
  ${chrome(t, h, 'smea.tech — the blog', 'rss')}
  <rect x="0" y="46" width="${W}" height="${h - 47}" fill="url(#dots)" opacity="0.35"/>
  ${prompt(t, 40, 88, 'curl -s https://smea.tech/feed | head -5')}
  <rect x="40" y="104" width="${W - 80}" height="1.5" fill="url(#rule)"/>
  ${rows}`);
}

/* ---------------------------------------------------------------- footer -- */

function footer(t) {
  const h = 92;
  const line = 'exit  #  thanks for scrolling — issues & PRs welcome';
  return svg(h, `${defs(t)}
  <rect x="0.5" y="0.5" width="${W - 1}" height="${h - 1}" rx="14" fill="${t.panel}" stroke="${t.border}"/>
  <rect x="0" y="0" width="${W}" height="${h}" rx="14" fill="url(#dots)" opacity="0.35"/>
  <rect x="40" y="30" width="${W - 80}" height="2" fill="url(#rule)"/>
  ${prompt(t, 40, 68, line, 15)}
  ${cursor(t, 40 + cw(15) * (line.length + 3), 68, 15)}`);
}

/* ------------------------------------------------------------------ main -- */

const [stats, posts] = await Promise.all([collect(), collectPosts()]);
console.log('stats:', JSON.stringify(stats));
console.log('posts:', posts.length, '- latest:', posts[0]?.title);

for (const t of Object.values(THEMES)) {
  const files = {
    [`banner-${t.id}.svg`]: banner(t),
    [`stack-${t.id}.svg`]: stack(t),
    [`pulse-${t.id}.svg`]: pulse(t, stats),
    [`blog-${t.id}.svg`]: blog(t, posts),
    [`footer-${t.id}.svg`]: footer(t),
  };
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(OUT, name), content);
    console.log(`  wrote assets/${name} (${content.length} B)`);
  }
}
