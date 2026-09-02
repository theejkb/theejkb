// Generates assets/stats.svg and assets/langs.svg from the GitHub GraphQL API.
// Runs inside GitHub Actions with the default GITHUB_TOKEN (public data only).
import { mkdirSync, writeFileSync } from "node:fs";

const LOGIN = process.env.GH_LOGIN || process.env.GITHUB_REPOSITORY_OWNER;
const TOKEN = process.env.GITHUB_TOKEN;
const OUT = process.env.OUT_DIR || "assets";

// Tokyo Night palette
const T = {
  bg: "#1a1b27",
  border: "#2b2d42",
  title: "#70a5fd",
  text: "#c0caf5",
  muted: "#7982a9",
  accent: "#bf91f3",
  accent2: "#38bdae",
};

const QUERY = `
query($login: String!) {
  user(login: $login) {
    name
    followers { totalCount }
    contributionsCollection {
      totalCommitContributions
      totalPullRequestContributions
      totalIssueContributions
      totalPullRequestReviewContributions
      restrictedContributionsCount
      contributionCalendar { totalContributions }
    }
    repositories(first: 100, ownerAffiliations: OWNER, isFork: false, orderBy: { field: STARGAZERS, direction: DESC }) {
      totalCount
      nodes {
        stargazerCount
        languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
          edges { size node { name color } }
        }
      }
    }
  }
}`;

async function fetchUser() {
  if (process.env.MOCK === "1") return mock();
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json", "User-Agent": "profile-stats" },
    body: JSON.stringify({ query: QUERY, variables: { login: LOGIN } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(`GraphQL error: ${res.status} ${JSON.stringify(json.errors || json)}`);
  return json.data.user;
}

function mock() {
  return {
    name: "Steven",
    followers: { totalCount: 18 },
    contributionsCollection: {
      totalCommitContributions: 812, totalPullRequestContributions: 96, totalIssueContributions: 14,
      totalPullRequestReviewContributions: 41, restrictedContributionsCount: 1900,
      contributionCalendar: { totalContributions: 3057 },
    },
    repositories: { totalCount: 42, nodes: [
      { stargazerCount: 3, languages: { edges: [
        { size: 90000, node: { name: "TypeScript", color: "#3178c6" } },
        { size: 20000, node: { name: "SCSS", color: "#c6538c" } },
        { size: 12000, node: { name: "HTML", color: "#e34c26" } },
        { size: 9000, node: { name: "Java", color: "#b07219" } },
        { size: 4000, node: { name: "JavaScript", color: "#f1e05a" } },
        { size: 2500, node: { name: "PHP", color: "#4F5D95" } },
        { size: 1000, node: { name: "Shell", color: "#89e051" } },
      ] } },
    ] },
  };
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmt = (n) => new Intl.NumberFormat("en-US").format(n);

function statsSvg(u) {
  const c = u.contributionsCollection;
  const stars = u.repositories.nodes.reduce((a, r) => a + r.stargazerCount, 0);
  const rows = [
    ["Contributions (last 12 months)", c.contributionCalendar.totalContributions, "#bf91f3"],
    ["Commits", c.totalCommitContributions + c.restrictedContributionsCount, "#70a5fd"],
    ["Pull requests", c.totalPullRequestContributions, "#38bdae"],
    ["Code reviews", c.totalPullRequestReviewContributions, "#7dcfff"],
    ["Issues", c.totalIssueContributions, "#ff9e64"],
    ["Stars earned", stars, "#e0af68"],
    ["Followers", u.followers.totalCount, "#f7768e"],
  ];
  const W = 480, rowH = 26, top = 62, H = top + rows.length * rowH + 18;
  const lines = rows.map(([label, value, icon], i) => {
    const y = top + i * rowH;
    return `
    <g transform="translate(24, ${y})">
      <rect x="0" y="-9" width="9" height="9" rx="2" fill="${icon}"/>
      <text class="label" x="30" y="0">${esc(label)}</text>
      <text class="value" x="${W - 48}" y="0" text-anchor="end">${fmt(value)}</text>
    </g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="GitHub stats for ${esc(LOGIN)}">
  <style>
    text { font-family: 'Segoe UI', Ubuntu, 'Helvetica Neue', Arial, sans-serif; }
    .title { font-size: 18px; font-weight: 600; fill: ${T.title}; }
    .label { font-size: 14px; fill: ${T.text}; }
    .value { font-size: 14px; font-weight: 700; fill: ${T.text}; }
    .sub { font-size: 11px; fill: ${T.muted}; }
  </style>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10" fill="${T.bg}" stroke="${T.border}"/>
  <text class="title" x="24" y="34">${esc(u.name || LOGIN)}'s GitHub stats</text>
  <text class="sub" x="${W - 24}" y="34" text-anchor="end">updated ${new Date().toISOString().slice(0, 10)}</text>
  ${lines}
</svg>`;
}

function langsSvg(u) {
  const totals = new Map();
  for (const r of u.repositories.nodes)
    for (const e of r.languages.edges) {
      const cur = totals.get(e.node.name) || { size: 0, color: e.node.color || T.accent };
      cur.size += e.size; totals.set(e.node.name, cur);
    }
  const all = [...totals.entries()].sort((a, b) => b[1].size - a[1].size);
  const sum = all.reduce((a, [, v]) => a + v.size, 0) || 1;
  const top = all.slice(0, 8);
  const W = 480, barY = 58, barH = 10, listTop = 92, col = 2, rowH = 24;
  const H = listTop + Math.ceil(top.length / col) * rowH + 14;
  let x = 24; const segs = [];
  for (const [name, v] of top) {
    const w = Math.max(2, (v.size / sum) * (W - 48));
    segs.push(`<rect x="${x.toFixed(1)}" y="${barY}" width="${w.toFixed(1)}" height="${barH}" fill="${v.color}"><title>${esc(name)}</title></rect>`);
    x += w;
  }
  const items = top.map(([name, v], i) => {
    const cx = 24 + (i % col) * ((W - 48) / col), cy = listTop + Math.floor(i / col) * rowH;
    const pct = ((v.size / sum) * 100).toFixed(1);
    return `<g transform="translate(${cx}, ${cy})">
      <circle cx="6" cy="-4" r="6" fill="${v.color}"/>
      <text class="label" x="20" y="0">${esc(name)}</text>
      <text class="pct" x="${(W - 48) / col - 16}" y="0" text-anchor="end">${pct}%</text>
    </g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Most used languages">
  <style>
    text { font-family: 'Segoe UI', Ubuntu, 'Helvetica Neue', Arial, sans-serif; }
    .title { font-size: 18px; font-weight: 600; fill: ${T.title}; }
    .label { font-size: 13px; fill: ${T.text}; }
    .pct { font-size: 13px; fill: ${T.muted}; }
  </style>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10" fill="${T.bg}" stroke="${T.border}"/>
  <text class="title" x="24" y="34">Most used languages</text>
  <clipPath id="bar"><rect x="24" y="${barY}" width="${W - 48}" height="${barH}" rx="5"/></clipPath>
  <g clip-path="url(#bar)">${segs.join("")}</g>
  ${items}
</svg>`;
}

const user = await fetchUser();
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/stats.svg`, statsSvg(user));
writeFileSync(`${OUT}/langs.svg`, langsSvg(user));
console.log(`Generated ${OUT}/stats.svg and ${OUT}/langs.svg for ${LOGIN}`);
