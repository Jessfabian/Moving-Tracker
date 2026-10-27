import { distanceMiles, type LatLng } from './geo';
import { SHELBY_SCHOOLS, SCHOOLS_DATA_YEAR } from './data/shelbySchools';

export { SCHOOLS_DATA_YEAR };

export type SchoolLevel = 'E' | 'M' | 'H';
export const SCHOOL_LEVELS: { key: SchoolLevel; label: string; short: string; grades: string }[] = [
  { key: 'E', label: 'Elementary', short: 'Elem', grades: 'K–5' },
  { key: 'M', label: 'Middle', short: 'Middle', grades: '6–8' },
  { key: 'H', label: 'High', short: 'High', grades: '9–12' },
];

export interface SchoolDistrict {
  system: number;
  name: string;
  short: string;
  municipal: boolean;
  kind: 'county' | 'municipal' | 'charter' | 'state' | 'lab';
  website: string;
  zoneLookup?: string;
  note: string;
}

export const SCHOOL_DISTRICTS: Record<number, SchoolDistrict> = {
  792: {
    system: 792,
    name: 'Memphis-Shelby County Schools',
    short: 'MSCS',
    municipal: false,
    kind: 'county',
    website: 'https://www.scsk12.org/',
    zoneLookup: 'https://www.schoolsitelocator.com/apps/shelbycounty/',
    note: 'The large county district for Memphis and unincorporated Shelby County. Your address sets a zoned school per level; optional (application) programs and charters are extra choices.',
  },
  793: { system: 793, name: 'Arlington Community Schools', short: 'Arlington', municipal: true, kind: 'municipal', website: 'https://www.acsk12.org/', note: 'Municipal district — only for homes inside the Arlington school boundary.' },
  794: { system: 794, name: 'Bartlett City Schools', short: 'Bartlett', municipal: true, kind: 'municipal', website: 'https://www.bartlettschools.org/', note: 'Municipal district — only for homes inside Bartlett city schools boundary.' },
  795: { system: 795, name: 'Collierville Schools', short: 'Collierville', municipal: true, kind: 'municipal', website: 'https://www.colliervilleschools.org/', note: 'Municipal district — only for homes inside the Collierville boundary.' },
  796: { system: 796, name: 'Germantown Municipal School District', short: 'Germantown', municipal: true, kind: 'municipal', website: 'https://www.gmsdk12.org/', note: 'Municipal district — only for homes inside the Germantown boundary.' },
  797: { system: 797, name: 'Lakeland School System', short: 'Lakeland', municipal: true, kind: 'municipal', website: 'https://www.lakelandschools.org/', note: 'Municipal district — only for homes inside the Lakeland boundary.' },
  798: { system: 798, name: 'Millington Municipal Schools', short: 'Millington', municipal: true, kind: 'municipal', website: 'https://www.millingtonschools.org/', note: 'Municipal district — only for homes inside the Millington boundary.' },
  985: { system: 985, name: 'Achievement School District', short: 'ASD', municipal: false, kind: 'state', website: 'https://www.tn.gov/education/', note: 'State-run district of turnaround charter schools.' },
  987: { system: 987, name: 'TN Public Charter School Commission', short: 'Charter', municipal: false, kind: 'charter', website: 'https://www.tn.gov/tpcsc.html', note: 'State-authorized charter schools — open enrollment / lottery.' },
  988: { system: 988, name: 'University Schools', short: 'U of M', municipal: false, kind: 'lab', website: 'https://www.memphis.edu/', note: 'University of Memphis lab school — application / lottery.' },
};

export interface School extends LatLng {
  id: string;
  name: string;
  system: number;
  district: SchoolDistrict;
  level: 'E' | 'M' | 'H' | 'P' | 'O';
  gradeLo: number;
  gradeHi: number;
  street: string;
  city: string;
  zip: string;
  phone: string;
  charter: boolean;
  special: boolean;
  enrollment: number | null;
  ratio: number | null;
  letter: string | null;
  score: number | null;
  achievement: string | null;
  growth: string | null;
  successRate: number | null;
  ccrRate: number | null;
}

let cache: School[] | null = null;
export function allSchools(): School[] {
  if (cache) return cache;
  cache = SHELBY_SCHOOLS.map((r) => ({
    id: r[0],
    name: r[1],
    system: r[2],
    district: SCHOOL_DISTRICTS[r[2]] ?? { system: r[2], name: `District ${r[2]}`, short: `${r[2]}`, municipal: false, kind: 'county', website: '', note: '' },
    level: r[3],
    gradeLo: r[4],
    gradeHi: r[5],
    street: r[6],
    city: r[7],
    zip: r[8],
    phone: r[9],
    charter: r[10] === 1,
    enrollment: r[11],
    ratio: r[12],
    lat: r[13],
    lng: r[14],
    letter: r[15],
    score: r[16],
    achievement: r[17],
    growth: r[18],
    successRate: r[19],
    ccrRate: r[20],
    special: r[21] === 1,
  }));
  return cache;
}

const gradeName = (g: number) => (g < 0 ? 'PK' : g === 0 ? 'K' : String(g));
export const schoolGrades = (s: Pick<School, 'gradeLo' | 'gradeHi'>) => `${gradeName(s.gradeLo)}–${gradeName(s.gradeHi)}`;

/** Does this school teach the core grades of a level? (a K-8 serves both elementary and middle) */
export function servesLevel(s: Pick<School, 'gradeLo' | 'gradeHi'>, level: SchoolLevel): boolean {
  if (level === 'E') return s.gradeLo <= 3 && s.gradeHi >= 3;
  if (level === 'M') return s.gradeLo <= 7 && s.gradeHi >= 7;
  return s.gradeLo <= 10 && s.gradeHi >= 10;
}

/** Child's school level from age on a given date (TN kindergarten cutoff Aug 15 ≈ age 5). */
export function levelForAge(age: number | null | undefined): SchoolLevel | null {
  if (age == null || age < 5 || age > 18) return null;
  const grade = age - 5;
  return grade <= 5 ? 'E' : grade <= 8 ? 'M' : 'H';
}

export const GRADE_RANK: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, F: 1 };
export const gradeRank = (letter: string | null | undefined) => (letter ? (GRADE_RANK[letter] ?? 0) : 0);
export const GRADE_COLOR: Record<string, string> = { A: '#15803d', B: '#65a30d', C: '#ca8a04', D: '#ea580c', F: '#dc2626' };
export const gradeColor = (letter: string | null | undefined) => (letter ? (GRADE_COLOR[letter] ?? '#6b7280') : '#6b7280');

const STOP = new Set(
  'school schools elementary elem middle high the of and es ms hs k8 jr sr junior senior academy prep preparatory optional campus center primary intermediate'.split(' '),
);
export function normalizeSchoolName(s: string): string {
  return String(s)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\bst\.?\s/g, 'saint ')
    .replace(/\bmt\.?\s/g, 'mount ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w))
    .join(' ');
}

/** "IDLEWILD ES" + 'E' → the Idlewild Elementary School record. */
export function matchSchoolName(desc: string | null | undefined, level: SchoolLevel, systems: number[] = [792, 985]): School | null {
  if (!desc) return null;
  const n = normalizeSchoolName(desc);
  if (!n) return null;
  const pool = allSchools().filter((s) => systems.includes(s.system));
  const exact = pool.filter((s) => normalizeSchoolName(s.name) === n);
  const loose = exact.length ? exact : pool.filter((s) => { const m = normalizeSchoolName(s.name); return m.startsWith(n) || n.startsWith(m); });
  if (!loose.length) return null;
  return loose.find((s) => servesLevel(s, level) && !s.special) ?? loose.find((s) => servesLevel(s, level)) ?? loose[0];
}

export interface SchoolZoneRaw {
  elem: string | null;
  mid: string | null;
  high: string | null;
  municipal: string | null;
}

const isPlaceholder = (v: unknown) => typeof v !== 'string' || !v.trim() || /call district|^n\/?a$/i.test(v);

/** Merge the Shelby County School Site Locator "StudyAreas" (layer 729) point query into one zone record. */
export function parseZoneResponse(json: unknown): SchoolZoneRaw {
  const feats = ((json as { features?: { attributes?: Record<string, unknown> }[] })?.features ?? []).map((f) => f.attributes ?? {});
  const pick = (k: string) => {
    for (const a of feats) if (!isPlaceholder(a[k])) return String(a[k]).trim();
    return null;
  };
  const muni = feats.map((a) => a.INT_DESC).find((v) => typeof v === 'string' && /MSD|municipal|city|schools?$/i.test(v.trim()));
  return { elem: pick('ELEM_DESC'), mid: pick('MID_DESC'), high: pick('HIGH_DESC'), municipal: typeof muni === 'string' ? muni.trim() : null };
}

export function municipalSystemFromName(name: string | null | undefined): number | null {
  if (!name) return null;
  const n = name.toLowerCase();
  for (const d of Object.values(SCHOOL_DISTRICTS)) if (d.municipal && n.includes(d.short.toLowerCase())) return d.system;
  return null;
}

export interface SchoolPick {
  level: SchoolLevel;
  school: School | null;
  zonedName: string | null;
  miles: number | null;
  /** municipal districts: every school of the level in the district (zones inside a city are not published here) */
  candidates: { school: School; miles: number }[];
}

export interface SchoolZone {
  district: SchoolDistrict | null;
  municipal: boolean;
  picks: SchoolPick[];
}

export function resolveZone(raw: SchoolZoneRaw, at: LatLng): SchoolZone {
  const sys = municipalSystemFromName(raw.municipal);
  const near = (s: School) => Math.round(distanceMiles(at, s) * 10) / 10;
  if (sys) {
    const district = SCHOOL_DISTRICTS[sys];
    const picks = SCHOOL_LEVELS.map(({ key }) => {
      const candidates = allSchools()
        .filter((s) => s.system === sys && servesLevel(s, key) && !s.special)
        .map((school) => ({ school, miles: near(school) }))
        .sort((a, b) => a.miles - b.miles);
      const first = candidates.length === 1 ? candidates[0] : null;
      return { level: key, school: first?.school ?? null, zonedName: null, miles: first?.miles ?? null, candidates };
    });
    return { district, municipal: true, picks };
  }
  const names = { E: raw.elem, M: raw.mid, H: raw.high };
  const picks = SCHOOL_LEVELS.map(({ key }) => {
    const school = matchSchoolName(names[key], key);
    return { level: key, school, zonedName: names[key], miles: school ? near(school) : null, candidates: [] };
  });
  const any = raw.elem || raw.mid || raw.high;
  return { district: any ? SCHOOL_DISTRICTS[792] : null, municipal: false, picks };
}

export interface SchoolFilter {
  levels?: SchoolLevel[];
  municipalOnly?: boolean;
  minGrade?: string | null;
  includeCharter?: boolean;
  includeSpecial?: boolean;
}

export function filterSchools(list: School[], f: SchoolFilter): School[] {
  const min = gradeRank(f.minGrade);
  return list.filter(
    (s) =>
      (f.includeSpecial || (!s.special && s.level !== 'P' && s.level !== 'O')) &&
      (!f.levels?.length || f.levels.some((l) => servesLevel(s, l))) &&
      (!f.municipalOnly || s.district.municipal) &&
      (f.includeCharter !== false || !s.charter) &&
      (!min || gradeRank(s.letter) >= min),
  );
}

/** Best options near a point: rated by TN letter grade, then success rate, then distance. */
export function bestNearby(at: LatLng, level: SchoolLevel, opts: { radiusMiles?: number; limit?: number; filter?: SchoolFilter } = {}) {
  const radius = opts.radiusMiles ?? 10;
  return filterSchools(allSchools(), { ...opts.filter, levels: [level] })
    .map((school) => ({ school, miles: Math.round(distanceMiles(at, school) * 10) / 10 }))
    .filter((x) => x.miles <= radius)
    .sort(
      (a, b) =>
        gradeRank(b.school.letter) - gradeRank(a.school.letter) ||
        (b.school.successRate ?? 0) - (a.school.successRate ?? 0) ||
        a.miles - b.miles,
    )
    .slice(0, opts.limit ?? 6);
}

const slug = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export function schoolLinks(s: School) {
  const q = encodeURIComponent(`${s.name} ${s.city} TN`);
  return {
    niche: `https://www.niche.com/k12/${slug(s.name)}-${slug(s.city)}-tn/`,
    greatSchools: `https://www.greatschools.org/search/search.page?q=${encodeURIComponent(s.name)}&state=TN`,
    usNews: `https://www.google.com/search?q=${encodeURIComponent('site:usnews.com/education/k12 ' + s.name + ' ' + s.city)}`,
    reportCard: 'https://tdepublicschools.ondemand.sas.com/',
    nces: `https://nces.ed.gov/ccd/schoolsearch/school_detail.asp?ID=${s.id}`,
    maps: `https://www.google.com/maps/search/?api=1&query=${q}`,
  };
}

export const SCHOOL_RESOURCES = [
  { label: 'Niche — best Memphis-area schools', url: 'https://www.niche.com/k12/search/best-schools/t/memphis-shelby-tn/' },
  { label: 'US News — MSCS district', url: 'https://www.usnews.com/education/k12/tennessee/districts/memphis-shelby-county-schools-113060' },
  { label: 'Shelby County school zone finder', url: 'https://www.schoolsitelocator.com/apps/shelbycounty/' },
  { label: 'MSCS 2025-26 district map (PDF)', url: 'https://www.scsk12.org/schools25/files/26/mscs%20schools%2025-26%2042x42%20district%20map.pdf' },
  { label: 'Memphis School Guide — districts & enrolling', url: 'https://memphisschoolguide.org/en/enroll/districts/' },
  { label: 'TN school report cards', url: 'https://tdepublicschools.ondemand.sas.com/' },
];
