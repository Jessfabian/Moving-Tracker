import { describe, expect, it } from 'vitest';
import { findAddressInText, listingFromUrl, parseListingHtml, parseListingText, unwrapLink } from '../src';

const wrapped =
  'https://urldefense.com/v3/__https://www.apartments.com/9954-lake-geneva-st-lakeland-tn-unit-1/3wk6d9g/?utm_source=shared_listing&utm_medium=direct__;!!CScduHDFkdaA!PLXt-rms8GwXEQxqSYGyivHcuZh_DMs6FUxDlNslzITcWy4wqCDOVoeuYfDKK6XosVeU6IiJeemk-Qy80cxyRYw$';

describe('listing links', () => {
  it('unwraps urldefense / safe links and drops tracking', () => {
    expect(unwrapLink(wrapped)).toBe('https://www.apartments.com/9954-lake-geneva-st-lakeland-tn-unit-1/3wk6d9g/');
    expect(unwrapLink('https://nam02.safelinks.protection.outlook.com/?url=https%3A%2F%2Fwww.zillow.com%2Fhomedetails%2Fx%2F1_zpid%2F&data=abc')).toBe('https://www.zillow.com/homedetails/x/1_zpid/');
    expect(unwrapLink('https://www.willowslakeland.com/')).toBe('https://www.willowslakeland.com/');
  });

  it('reads the address straight out of the URL', () => {
    expect(listingFromUrl(wrapped)).toMatchObject({ address: '9954 Lake Geneva St Unit 1', city: 'Lakeland', state: 'TN' });
    expect(listingFromUrl('https://www.firstkeyhomes.com/homes-for-rent/10249501/10242-evergreen-manor-cove-lakeland-tn-38002')).toMatchObject({
      address: '10242 Evergreen Manor Cove',
      city: 'Lakeland',
      state: 'TN',
      zip: '38002',
    });
    expect(listingFromUrl('https://www.apartments.com/the-willows-at-the-lake-district-lakeland-tn/kj22x19/')).toMatchObject({ title: 'The Willows at the Lake District', city: 'Lakeland', state: 'TN' });
    expect(listingFromUrl('https://www.apartments.com/10242-evergreen-manor-cv-lakeland-tn/l0wpryd/')).toMatchObject({ address: '10242 Evergreen Manor Cv', city: 'Lakeland' });
    expect(listingFromUrl('https://www.willowslakeland.com/').address).toBeUndefined();
  });

  it('finds footer addresses without a comma before the city', () => {
    expect(findAddressInText('SIGN UP 9932 LAKE GENEVA ST N LAKELAND, TN 38002 (901) 504-4446')).toEqual({ address: '9932 Lake Geneva St N', city: 'Lakeland', state: 'TN', zip: '38002' });
  });

  it('reads inline app data (FirstKey style transfer state)', () => {
    const html = `<meta property="og:title" content="10242 Evergreen Manor Cove Lakeland TN 38002 Single Family Home for Rent | FirstKey Homes">
<meta property="og:image" content="https://cdn.example.net/${'a'.repeat(64)}/636x416">
<script id="state">{&q;address&q;:&q;10242 EVERGREEN MANOR COVE&q;,&q;area&q;:2900,&q;bathrooms&q;:3,&q;bedrooms&q;:4,&q;city&q;:&q;Lakeland&q;,&q;images&q;:[{&q;url&q;:&q;${'a'.repeat(64)}&q;},{&q;url&q;:&q;${'b'.repeat(64)}&q;}],&q;location&q;:{&q;type&q;:&q;Point&q;,&q;coordinates&q;:[-89.7209,35.2682]},&q;state&q;:&q;TN&q;,&q;zip&q;:&q;38002&q;,&q;rent&q;:2700}</script>`;
    const info = parseListingHtml(html, 'https://www.firstkeyhomes.com/x');
    expect(info).toMatchObject({ rent: 2700, bedrooms: 4, bathrooms: 3, sqft: 2900, city: 'Lakeland', state: 'TN', zip: '38002', lat: 35.2682, lng: -89.7209 });
    expect(info.title).toBe('10242 Evergreen Manor Cove Lakeland TN 38002');
    expect(info.images).toHaveLength(2);
    expect(info.address).toBe('10242 Evergreen Manor Cove');
  });

  it('parses pasted listing text', () => {
    const t = `9954 Lake Geneva St Unit 1, Lakeland, TN 38002\nMonthly Rent\n$2,950\nBedrooms\n3 bd\nBathrooms\n2.5 ba\nSquare Feet\n2,058 sq ft\nCall (901) 555-1234`;
    expect(parseListingText(t)).toMatchObject({ rent: 2950, bedrooms: 3, bathrooms: 2.5, sqft: 2058, city: 'Lakeland', state: 'TN', zip: '38002', phone: '(901) 555-1234' });
  });
});
