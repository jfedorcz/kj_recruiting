import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';

const file = new URL('../data/stats.json', import.meta.url);
const previous = JSON.parse(await readFile(file, 'utf8'));
const profileRoot = 'https://www.maxpreps.com/co/denver/develyn-jaguars/athletes/kurt-fedorczyk';
const career = '?careerid=5ueu37hf44fee';
const urls = {
  volleyball: `${profileRoot}/volleyball/boys/stats/${career}`,
  basketball: `${profileRoot}/basketball/stats/${career}`,
  hudl: 'https://www.hudl.com/profile/24949040/Kurt-Fedorczyk/highlights',
  chsaa: 'https://chsaanow.com/news/2026/05/18/boys-volleyball-all-state-teams-for-2026-season-announced'
};

const number = (value) => {
  const parsed = Number(String(value ?? '').replace(/[% ,]/g, ''));
  return Number.isFinite(parsed) ? parsed : undefined;
};
const key = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9%/]+/g, ' ').trim();
const pick = (map, aliases) => {
  for (const alias of aliases) {
    if (map.has(key(alias))) return number(map.get(key(alias)));
  }
};
const required = (value, label) => {
  if (!Number.isFinite(value)) throw new Error(`Missing required MaxPreps field: ${label}`);
  return value;
};

async function scrapeTables(page, url, categories) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.getByRole('heading', { name: /Kurt Fedorczyk's Stats/i }).waitFor({ timeout: 30_000 });
  const collected = new Map();

  for (const category of categories) {
    const button = page.getByRole('button', { name: new RegExp(`^${category}$`, 'i') });
    if (await button.count()) {
      await button.first().click();
      await page.waitForTimeout(350);
    }
    const tables = await page.locator('table').evaluateAll((elements) => elements.map((table) => {
      const headers = [...table.querySelectorAll('thead th, tr:first-child th')].map((cell) => cell.textContent.trim());
      const rows = [...table.querySelectorAll('tbody tr')].map((row) => [...row.querySelectorAll('th,td')].map((cell) => cell.textContent.trim()));
      return { headers, rows };
    }));
    for (const table of tables) {
      if (!table.headers.length || !table.rows.length) continue;
      const row = table.rows.findLast((cells) => /varsity total|25-26/i.test(cells.join(' '))) ?? table.rows.at(-1);
      table.headers.forEach((header, index) => {
        if (header && row[index] !== undefined) collected.set(key(header.replace(/^sort by /i, '')), row[index]);
      });
    }
  }
  return collected;
}

async function sourceReachable(page, url) {
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    return Boolean(response?.ok());
  } catch {
    return false;
  }
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ userAgent: 'Mozilla/5.0 (compatible; KJRecruitingStats/1.0)' });
  const volleyball = await scrapeTables(page, urls.volleyball, ['Attacking', 'Blocking']);
  const basketball = await scrapeTables(page, urls.basketball, ['Scoring', 'Shooting', 'Rebounding', 'Assists', 'Steals', 'Blocks']);
  const now = new Date().toISOString();

  const sets = required(pick(volleyball, ['SP']), 'volleyball sets');
  const kills = required(pick(volleyball, ['K']), 'volleyball kills');
  const attempts = required(pick(volleyball, ['Att']), 'volleyball attempts');
  const errors = required(pick(volleyball, ['E']), 'volleyball hitting errors');
  const soloBlocks = required(pick(volleyball, ['BS']), 'volleyball solo blocks');
  const totalBlocks = required(pick(volleyball, ['TB']), 'volleyball total blocks');

  const next = structuredClone(previous);
  next.sources.maxpreps = { ...next.sources.maxpreps, status: 'verified' };
  next.volleyball = {
    sets,
    kills,
    killsPerSet: required(pick(volleyball, ['K/S']), 'volleyball kills per set'),
    killPercentage: required(pick(volleyball, ['Kill %']), 'volleyball kill percentage'),
    attackAttempts: attempts,
    hittingErrors: errors,
    hittingPercentage: required(pick(volleyball, ['Hit %', 'Pct']), 'volleyball hitting percentage'),
    soloBlocks,
    blockAssists: totalBlocks - soloBlocks,
    totalBlocks,
    blocksPerSet: Number((totalBlocks / sets).toFixed(1))
  };

  const basketballUpdates = {
    pointsPerGame: pick(basketball, ['PPG', 'PTS/G']),
    totalPoints: pick(basketball, ['PTS', 'Points']),
    reboundsPerGame: pick(basketball, ['RPG', 'REB/G']),
    totalRebounds: pick(basketball, ['REB', 'TR']),
    fieldGoalPercentage: pick(basketball, ['FG%', 'FG %']),
    fieldGoalsMade: pick(basketball, ['FGM']),
    fieldGoalsAttempted: pick(basketball, ['FGA']),
    twoPointMade: pick(basketball, ['2PM', '2FGM']),
    twoPointAttempted: pick(basketball, ['2PA', '2FGA']),
    freeThrowsMade: pick(basketball, ['FTM']),
    freeThrowsAttempted: pick(basketball, ['FTA']),
    freeThrowPercentage: pick(basketball, ['FT%', 'FT %']),
    blocks: pick(basketball, ['BLK', 'BS']),
    blocksPerGame: pick(basketball, ['BPG', 'BLK/G']),
    assistsPerGame: pick(basketball, ['APG', 'AST/G']),
    stealsPerGame: pick(basketball, ['SPG', 'STL/G'])
  };
  for (const [name, value] of Object.entries(basketballUpdates)) {
    if (Number.isFinite(value)) next.basketball[name] = value;
  }

  for (const name of ['hudl', 'chsaa']) {
    const reachable = await sourceReachable(page, urls[name]);
    next.sources[name] = { ...next.sources[name], status: reachable ? 'linked' : 'unreachable' };
  }

  const comparable = (data) => ({
    sourceStatuses: Object.fromEntries(Object.entries(data.sources).map(([name, source]) => [name, source.status])),
    volleyball: data.volleyball,
    basketball: data.basketball
  });
  if (JSON.stringify(comparable(next)) !== JSON.stringify(comparable(previous))) {
    next.updatedAt = now;
    for (const source of Object.values(next.sources)) source.checkedAt = now;
    await writeFile(file, `${JSON.stringify(next, null, 2)}\n`);
  }
} finally {
  await browser.close();
}
