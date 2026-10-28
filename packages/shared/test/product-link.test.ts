import { describe, expect, it } from 'vitest';
import { brandFromName, fillProductGaps, isJunkProductName, modelFromName, parseTargetProduct, productToItemPatch, targetTcin } from '../src/products';

describe('shopping link import', () => {
  it('pulls the brand and model out of a product name', () => {
    expect(brandFromName('Dyson V8 Origin Cordless Vacuum')).toBe('Dyson');
    expect(brandFromName('KitchenAid Artisan 5-Qt Stand Mixer')).toBe('KitchenAid');
    expect(brandFromName('Hamilton Beach 2-Slice Toaster')).toBe('Hamilton Beach');
    expect(brandFromName('Cordless vacuum')).toBe('');
    expect(modelFromName('Dyson V8 Origin Cordless Vacuum')).toBe('V8');
    expect(modelFromName('KitchenAid Artisan, 5-Qt Tilt Head Stand Mixer, KSM150PS, Empire Red')).toBe('KSM150PS');
    expect(modelFromName('DEWALT 20V MAX Drill 12oz')).toBe('');
  });

  it('flags bot-check pages', () => {
    expect(isJunkProductName('Robot or human?')).toBe(true);
    expect(isJunkProductName('Products')).toBe(true);
    expect(isJunkProductName('Dyson V8')).toBe(false);
  });

  it('reads Target product ids and their product feed', () => {
    expect(targetTcin('https://www.target.com/p/some-thing/-/A-82733306?preselect=82733296')).toBe('82733296');
    expect(targetTcin('https://www.target.com/p/some-thing/-/A-82733306')).toBe('82733306');
    expect(targetTcin('https://www.walmart.com/ip/x/123')).toBeNull();
    const info = parseTargetProduct({
      data: {
        product: {
          price: { reg_retail_max: 449.99, current_retail: 399.99 },
          item: {
            primary_brand: { name: 'Dyson' },
            product_description: { title: 'Dyson V8 Cordless Vacuum', bullet_descriptions: ['<B>Model Number:</B> 400473-01'] },
            enrichment: { image_info: { primary_image: { url: 'https://target.scene7.com/x.jpg' } } },
          },
        },
      },
    });
    expect(info).toMatchObject({ name: 'Dyson V8 Cordless Vacuum', brand: 'Dyson', model: '400473-01', price: 449.99, image: 'https://target.scene7.com/x.jpg' });
  });

  it('a link import replaces the name, brand, model and price but never blanks them', () => {
    const info = fillProductGaps({ barcode: '', name: 'Dyson V8 Origin Cordless Vacuum', brand: '', model: '', description: 'Stick vacuum', category: 'other', image: '', price: 299, resale: 120, source: 'walmart.com' });
    const patch = productToItemPatch(info, { name: 'Vacuum', brand: 'Old', model: '', description: '', category: 'cleaning', image_url: 'keep.jpg' }, true);
    expect(patch).toMatchObject({ name: 'Dyson V8 Origin Cordless Vacuum', brand: 'Dyson', model: 'V8', retail_price: 299, description: 'Stick vacuum' });
    expect(patch).not.toHaveProperty('image_url');
  });
});
