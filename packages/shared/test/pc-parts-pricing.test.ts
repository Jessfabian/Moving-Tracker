import { describe, expect, it } from 'vitest';
import { itemPriceIdea } from '../src/itemPricing';
import { guessItemCategory, isComputerPart, resaleEstimate } from '../src/products';

const ram = { name: 'Corsair Vengeance RGB DDR5 RAM 64GB', category: 'other', condition: 'good' as const, quantity: 1 };

describe('computer parts hold their value', () => {
  it('recognizes PC parts', () => {
    expect(isComputerPart(ram.name)).toBe(true);
    expect(isComputerPart('NVIDIA GeForce RTX 4070 graphics card')).toBe(true);
    expect(isComputerPart('Samsung 990 Pro 2TB NVMe SSD')).toBe(true);
    expect(isComputerPart('AMD Ryzen 7 7800X3D')).toBe(true);
    expect(isComputerPart('Ram statue')).toBe(false);
    expect(isComputerPart('Dodge Ram floor mats')).toBe(false);
    expect(isComputerPart('32GB RAM kit')).toBe(true);
    expect(isComputerPart('Kingston laptop memory 16GB')).toBe(true);
    expect(isComputerPart('Food processor')).toBe(false);
    expect(isComputerPart('Sofa')).toBe(false);
    expect(isComputerPart('Programmer desk')).toBe(false);
    expect(guessItemCategory(ram.name)).toBe('electronics');
  });

  it('values used RAM near today’s price when prices have climbed', () => {
    const idea = itemPriceIdea({ ...ram, retail_price: 1338.99, purchase_price: 208 });
    expect(idea.likely).toBeGreaterThanOrEqual(950);
    expect(idea.likely).toBeLessThanOrEqual(1100);
    expect(idea.high).toBeLessThan(1338.99);
    expect(idea.steps.join(' ')).toMatch(/Prices are up 544% since you paid \$208/);
    expect(idea.verdict).toBe('keep');
  });

  it('still depreciates with age, but gently', () => {
    const idea = itemPriceIdea({ ...ram, retail_price: 1338.99, purchase_date: '2024-10-01' }, { today: new Date('2026-10-28') });
    expect(idea.likely).toBeGreaterThan(850);
    expect(idea.likely).toBeLessThan(1000);
  });

  it('shopping-link resale uses 75% for parts, 40% otherwise', () => {
    expect(resaleEstimate(1338.99, ram.name)).toBe(1004);
    expect(resaleEstimate(400, 'KitchenAid mixer')).toBe(160);
  });
});
