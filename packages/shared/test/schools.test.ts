import { describe, expect, it } from 'vitest';
import { allSchools, bestNearby, filterSchools, levelForAge, matchSchoolName, parseZoneResponse, resolveZone, servesLevel } from '../src/schools';

const midtown = { features: [
  { attributes: { STDYAREA: 'DIST', ELEM_DESC: null } },
  { attributes: { STDYAREA: 'BNDRY', ELEM_DESC: 'IDLEWILD ES' } },
  { attributes: { STDYAREA: '654', ELEM_DESC: 'IDLEWILD ES', MID_DESC: 'HAMILTON MS', INT_DESC: ' ', HIGH_DESC: 'CENTRAL HS' } },
] };
const germantown = { features: [
  { attributes: { HIGH_DESC: 'PLEASE CALL DISTRICT OFFICE' } },
  { attributes: { ELEM_DESC: 'PLEASE CALL DISTRICT OFFICE', MID_DESC: 'PLEASE CALL DISTRICT OFFICE', INT_DESC: 'Germantown MSD', HIGH_DESC: 'PLEASE CALL DISTRICT OFFICE' } },
] };

describe('schools', () => {
  it('bundles Shelby County schools with TN letter grades', () => {
    const all = allSchools();
    expect(all.length).toBeGreaterThan(250);
    expect(all.filter((s) => s.letter).length).toBeGreaterThan(200);
    expect(all.every((s) => s.lat > 34.9 && s.lat < 35.5 && s.lng < -89.5 && s.lng > -90.2)).toBe(true);
  });

  it('parses MSCS zones and matches school records', () => {
    const raw = parseZoneResponse(midtown);
    expect(raw).toEqual({ elem: 'IDLEWILD ES', mid: 'HAMILTON MS', high: 'CENTRAL HS', municipal: null });
    const z = resolveZone(raw, { lat: 35.135, lng: -89.99 });
    expect(z.district?.short).toBe('MSCS');
    expect(z.picks.map((p) => p.school?.name)).toEqual([
      expect.stringMatching(/Idlewild/i),
      expect.stringMatching(/Hamilton/i),
      expect.stringMatching(/Central High/i),
    ]);
    expect(z.picks[0].miles).toBeLessThan(3);
  });

  it('recognizes municipal districts and lists their schools', () => {
    const raw = parseZoneResponse(germantown);
    expect(raw.elem).toBeNull();
    const z = resolveZone(raw, { lat: 35.087, lng: -89.8 });
    expect(z.municipal).toBe(true);
    expect(z.district?.name).toMatch(/Germantown/);
    expect(z.picks[2].candidates[0].school.name).toMatch(/Houston High/i);
    expect(z.picks[0].candidates.length).toBeGreaterThan(1);
  });

  it('matches level-specific names and grade spans', () => {
    expect(matchSchoolName('WHITE STATION HS', 'H')?.name).toMatch(/White Station High/i);
    expect(matchSchoolName('WHITE STATION MS', 'M')?.name).toMatch(/White Station Middle/i);
    expect(servesLevel({ gradeLo: 0, gradeHi: 8 }, 'M')).toBe(true);
    expect(levelForAge(6)).toBe('E');
    expect(levelForAge(12)).toBe('M');
    expect(levelForAge(15)).toBe('H');
  });

  it('ranks nearby options by grade then distance', () => {
    const best = bestNearby({ lat: 35.087, lng: -89.8 }, 'E', { radiusMiles: 8 });
    expect(best[0].school.letter).toBe('A');
    expect(filterSchools(allSchools(), { municipalOnly: true }).every((s) => s.district.municipal)).toBe(true);
  });
});

