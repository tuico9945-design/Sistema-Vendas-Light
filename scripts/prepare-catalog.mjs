import { readFile, writeFile } from 'node:fs/promises';

const input = new URL('../public/catalogo.js', import.meta.url);
const output = new URL('../netlify/functions/catalog-data.mjs', import.meta.url);
const source = await readFile(input, 'utf8');
const marker = 'window.LOJA_PRODUTOS';
const markerAt = source.indexOf(marker);
if (markerAt < 0) throw new Error('Não encontrei window.LOJA_PRODUTOS em public/catalogo.js');
const equalsAt = source.indexOf('=', markerAt + marker.length);
const endAt = source.lastIndexOf(';');
if (equalsAt < 0 || endAt <= equalsAt) throw new Error('Não consegui ler public/catalogo.js');

const allProducts = JSON.parse(source.slice(equalsAt + 1, endAt).trim());
if (!Array.isArray(allProducts)) throw new Error('O catálogo precisa ser uma lista de produtos.');
const products = allProducts
  .filter(product => product && product.id != null && product.visible !== false)
  .map(product => ({
    id: String(product.id),
    sku: String(product.sku || ''),
    name: String(product.name || ''),
    price: Number(product.price)
  }))
  .filter(product => product.name && Number.isFinite(product.price) && product.price >= 0);

await writeFile(output, `export const products = ${JSON.stringify(products)};\n`, 'utf8');
console.log(`Catálogo de pedidos preparado: ${products.length} produtos visíveis.`);
