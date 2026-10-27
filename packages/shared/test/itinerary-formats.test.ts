import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { bookedRoute, flightCallsign, flightTrackerLinks, parseItinerary } from '../src/airlines';

describe('parseItinerary — real-world formats', () => {
  it('reads a copied United "My trips" page (glued text, details before the flight #, ads ignored)', () => {
    const p = parseItinerary(readFileSync(__dirname + '/fixtures/united-web.txt', 'utf8'), { year: 2026 });
    expect(p.confirmation).toBe('G9SB8X');
    expect(p.airline).toBe('UA');
    expect(p.flights).toHaveLength(2);
    expect(p.flights[0]).toMatchObject({ flight_number: '1966', origin: 'AUS', destination: 'IAH', start_date: '2026-11-15', start_time: '05:15', end_time: '06:28', seat: '30C', aircraft: 'Airbus A320' });
    expect(p.flights[1]).toMatchObject({ flight_number: '5574', origin: 'IAH', destination: 'MEM', start_date: '2026-11-15', start_time: '07:20', end_time: '09:02', seat: '22C', operated_by: 'SKYWEST' });
    // rental-car "Total amount $254.44" and "Earn 612 miles" are ads, not the fare / miles used
    expect(p.cost).toBeNull();
    expect(p.miles_used).toBeNull();
  });

  it('reads a United e-ticket receipt PDF', () => {
    const p = parseItinerary(
      `eTicket Itinerary and Receipt
Confirmation Number:
G9SB8X
Issue Date: October 26, 2026
Traveler eTicket Number Frequent Flyer Seats
FABIAN/ESTEBAN 0162123456789 30C/22C
FLIGHT INFORMATION
Day, Date Flight Class Departure City and Time Arrival City and Time Aircraft Meal
SUN, 15NOV26 UA1966 S AUSTIN, TX (AUS) 5:15 AM HOUSTON, TX (IAH - INTERCONTINENTAL) 6:28 AM AIRBUS A320 None
SUN, 15NOV26 UA5574 S HOUSTON, TX (IAH - INTERCONTINENTAL) 7:20 AM MEMPHIS, TN (MEM) 9:02 AM EMBRAER E175 None
Flight Operated By SKYWEST DBA UNITED EXPRESS.
FARE INFORMATION
Fare Breakdown
Airfare: 213.95
U.S. Transportation Tax: 16.05
U.S. Flight Segment Tax: 10.40
September 11th Security Fee: 5.60
Total Per Passenger: 255.60 USD
Total: 255.60 USD`,
      { year: 2026 },
    );
    expect(p.confirmation).toBe('G9SB8X');
    expect(p.flights.map((f) => [f.flight_number, f.origin, f.destination, f.start_date, f.start_time, f.end_time])).toEqual([
      ['1966', 'AUS', 'IAH', '2026-11-15', '05:15', '06:28'],
      ['5574', 'IAH', 'MEM', '2026-11-15', '07:20', '09:02'],
    ]);
    expect(p.cost).toBe(255.6);
  });

  it('tracks regional flights by the operating carrier and maps the booked route', () => {
    expect(flightCallsign('UA', '5574', 'SKYWEST')).toBe('SKW5574');
    expect(flightCallsign('UA', '1966', '')).toBe('UAL1966');
    expect(flightTrackerLinks('UA', '5574', null, 'SkyWest')[0]!.url).toContain('SKW5574');
    const r = bookedRoute('AUS', 'iah');
    expect(r?.destination.iata).toBe('IAH');
    expect(r!.distanceMiles).toBeGreaterThan(130);
    expect(r!.distanceMiles).toBeLessThan(150);
    expect(bookedRoute('AUS', 'XXX')).toBeNull();
  });
});