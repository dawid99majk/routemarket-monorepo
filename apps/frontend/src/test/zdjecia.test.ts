import { describe, it, expect } from 'vitest';
import { miniatura, SZEROKOSC } from '@/lib/zdjecia';

/** Prawdziwy adres z bazy, skrócony o środek referencji. */
const GOOGLE = 'https://lh3.googleusercontent.com/place-photos/AG9NLjAYuXthrORb9_vl-sEley=s1600';

describe('miniatura — zdjęcia z CDN Google', () => {
  it('podmienia sufiks rozmiaru na żądaną szerokość', () => {
    expect(miniatura(GOOGLE, SZEROKOSC.kafelek)).toMatch(/=s330$/);
    expect(miniatura(GOOGLE, SZEROKOSC.karta)).toMatch(/=s500$/);
    expect(miniatura(GOOGLE, SZEROKOSC.bohater)).toMatch(/=s1280$/);
  });

  it('nie zostawia dwóch sufiksów', () => {
    const wynik = miniatura(GOOGLE, 330);
    expect(wynik.match(/=s\d+/g)).toHaveLength(1);
  });

  it('dokłada sufiks, gdy adres go nie ma', () => {
    const bez = 'https://lh3.googleusercontent.com/place-photos/AG9NLjAYuXth';
    expect(miniatura(bez, 330)).toBe(bez + '=s330');
  });

  it('radzi sobie z sufiksem szerokość-wysokość', () => {
    const wh = 'https://lh3.googleusercontent.com/place-photos/AG9NLj=w800-h600';
    expect(miniatura(wh, 330)).toMatch(/=s330$/);
    expect(miniatura(wh, 330)).not.toContain('w800');
  });

  it('działa dla dowolnego numeru hosta lh', () => {
    const lh5 = 'https://lh5.googleusercontent.com/place-photos/AG9NLj=s1600';
    expect(miniatura(lh5, 330)).toMatch(/=s330$/);
  });
});

describe('miniatura — nie psuje pozostałych źródeł', () => {
  it('Wikimedia dalej dostaje dozwoloną szerokość', () => {
    const commons = 'https://upload.wikimedia.org/wikipedia/commons/9/9d/Ogrod.jpg';
    // 330 jest na liście dozwolonych szerokości Wikimediów.
    expect(miniatura(commons, 330)).toContain('/thumb/');
    expect(miniatura(commons, 330)).toContain('330px-Ogrod.jpg');
  });

  it('obcy adres zostaje nietknięty', () => {
    const obcy = 'https://example.com/foto.jpg';
    expect(miniatura(obcy, 330)).toBe(obcy);
  });

  it('pusty adres daje pusty łańcuch', () => {
    expect(miniatura(null, 330)).toBe('');
    expect(miniatura(undefined, 330)).toBe('');
  });
});
