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
const ORGS = ['GollumSF', 'GollumJS', 'GollumDom'];
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
  const h = 384;
  const name = 'DAMIEN  DUBOEUF';
  const rows = [
    ['role', 'Backend & full-stack engineer — freelance, remote'],
    ['stack', 'PHP · Symfony · TypeScript · Node · Docker · MQTT'],
    ['orgs', 'GollumSF · GollumJS · GollumDom'],
    ['blog', 'smea.tech — homelab, self-hosting, home automation'],
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
  <text x="40" y="354" font-family="${MONO}" font-size="16" fill="${t.green}" font-weight="600">$</text>
  ${cursor(t, 58, 354)}`);
}

/* ----------------------------------------------------------------- stack -- */

const STACK = [
  ['backend ', ['PHP', 'Symfony', 'Doctrine', 'API REST', 'MySQL', 'Redis', 'Composer']],
  ['frontend', ['TypeScript', 'Vue', 'React', 'Node', 'SCSS', 'Webpack', 'Babylon.js']],
  ['infra   ', ['Docker', 'Nginx', 'Traefik', 'GitLab CI', 'Debian', 'Bash', 'Make']],
  ['iot     ', ['MQTT', 'Home Assistant', 'ESPHome', 'Arduino', 'Zigbee', 'Raspberry Pi']],
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

const stats = await collect();
console.log('stats:', JSON.stringify(stats));

for (const t of Object.values(THEMES)) {
  const files = {
    [`banner-${t.id}.svg`]: banner(t),
    [`stack-${t.id}.svg`]: stack(t),
    [`pulse-${t.id}.svg`]: pulse(t, stats),
    [`footer-${t.id}.svg`]: footer(t),
  };
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(OUT, name), content);
    console.log(`  wrote assets/${name} (${content.length} B)`);
  }
}
