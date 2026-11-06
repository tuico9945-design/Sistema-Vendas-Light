import { createHmac, pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { products } from './catalog-data.mjs';

const pbkdf2Async = promisify(pbkdf2);
const ORDER_STATUSES = new Set(['novo', 'confirmado', 'em_preparacao', 'enviado', 'entregue', 'cancelado']);

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function reply(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

function requireSettings() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.SVL_SESSION_SECRET) {
    throw new HttpError(503, 'O serviço online ainda não foi configurado. Confira as variáveis do Netlify.');
  }
}

async function readBody(request) {
  const text = await request.text();
  if (Buffer.byteLength(text, 'utf8') > 128 * 1024) throw new HttpError(413, 'Os dados enviados são muito grandes.');
  try { return JSON.parse(text); } catch { throw new HttpError(400, 'Não consegui ler os dados enviados.'); }
}

async function db(path, { method = 'GET', body, prefer } = {}) {
  const base = process.env.SUPABASE_URL.replace(/\/+$/, '');
  const headers = {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    Accept: 'application/json'
  };
  if (prefer) headers.Prefer = prefer;
  let response;
  try {
    response = await fetch(`${base}/rest/v1/${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new HttpError(503, 'Não foi possível conectar ao banco de dados.');
  }
  const text = await response.text();
  let result = null;
  if (text) { try { result = JSON.parse(text); } catch { result = null; } }
  if (!response.ok) {
    const status = response.status === 409 ? 409 : 503;
    throw new HttpError(status, status === 409 ? 'Já existe uma conta com esse e-mail.' : 'O banco de dados recusou a solicitação. Confira a configuração do projeto.');
  }
  return result;
}

function accountKey(email) {
  const query = new URLSearchParams({ email: `eq.${email}`, select: 'id,nome,documento,telefone,endereco,email,password_salt,password_hash' });
  return `svl_customers?${query}`;
}

function publicCustomer(row) {
  return { id: row.id, nome: row.nome, documento: row.documento || '', telefone: row.telefone, endereco: row.endereco, email: row.email };
}

function issueToken(customerId) {
  const payload = Buffer.from(JSON.stringify({ sub: customerId, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 })).toString('base64url');
  const signature = createHmac('sha256', process.env.SVL_SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function sessionCustomer(request) {
  const [payload, signature, extra] = String(request.headers.get('X-SVL-Session') || '').split('.');
  if (!payload || !signature || extra) throw new HttpError(401, 'Entre novamente na sua conta para continuar.');
  const expected = createHmac('sha256', process.env.SVL_SESSION_SECRET).update(payload).digest();
  let actual;
  try { actual = Buffer.from(signature, 'base64url'); } catch { throw new HttpError(401, 'Entre novamente na sua conta para continuar.'); }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new HttpError(401, 'Entre novamente na sua conta para continuar.');
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.sub || data.exp < Date.now()) throw new Error();
    return data.sub;
  } catch { throw new HttpError(401, 'Entre novamente na sua conta para continuar.'); }
}

function requireAdmin(request) {
  const configured = process.env.SVL_ADMIN_KEY || '';
  const received = request.headers.get('X-SVL-Admin-Key') || '';
  const left = Buffer.from(configured);
  const right = Buffer.from(received);
  if (left.length < 32 || left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new HttpError(configured.length < 32 ? 503 : 401, configured.length < 32 ? 'O painel de pedidos ainda não foi configurado.' : 'A chave do painel está incorreta.');
  }
}

function orderRecord(row) {
  return {
    id: row.id,
    number: row.number,
    clientId: row.client_id,
    client: row.client_snapshot,
    items: row.items,
    total: Number(row.total),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function handle(request) {
  requireSettings();
  const path = new URL(request.url).pathname;
  const method = request.method.toUpperCase();

  if (path === '/api/customer/register' && method === 'POST') {
    const input = await readBody(request);
    const nome = String(input.nome || '').trim();
    const email = String(input.email || '').trim().toLowerCase();
    const telefone = String(input.telefone || '').trim();
    const endereco = String(input.endereco || '').trim();
    const senha = String(input.senha || '');
    if (nome.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || telefone.length < 8 || endereco.length < 3 || senha.length < 8) {
      throw new HttpError(400, 'Confira nome, e-mail, telefone, endereço e senha (mínimo de 8 caracteres).');
    }
    const salt = randomBytes(16);
    const hash = await pbkdf2Async(senha, salt, 310000, 32, 'sha256');
    const rows = await db('svl_customers?select=id,nome,documento,telefone,endereco,email,password_salt,password_hash', {
      method: 'POST',
      prefer: 'return=representation',
      body: {
        nome,
        documento: String(input.documento || '').trim(),
        telefone,
        endereco,
        email,
        password_salt: salt.toString('base64'),
        password_hash: hash.toString('base64')
      }
    });
    const customer = publicCustomer(rows[0]);
    return reply({ customer, token: issueToken(customer.id) }, 201);
  }

  if (path === '/api/customer/login' && method === 'POST') {
    const input = await readBody(request);
    const email = String(input.email || '').trim().toLowerCase();
    const rows = await db(accountKey(email));
    const account = rows?.[0];
    let valid = false;
    if (account) {
      try {
        const salt = Buffer.from(account.password_salt, 'base64');
        const expected = Buffer.from(account.password_hash, 'base64');
        const actual = await pbkdf2Async(String(input.senha || ''), salt, 310000, 32, 'sha256');
        valid = expected.length === actual.length && timingSafeEqual(expected, actual);
      } catch { valid = false; }
    }
    if (!valid) throw new HttpError(401, 'E-mail ou senha incorretos.');
    return reply({ customer: publicCustomer(account), token: issueToken(account.id) });
  }

  if (path === '/api/customer/orders' && method === 'GET') {
    const customerId = sessionCustomer(request);
    const query = new URLSearchParams({ select: 'id,number,client_id,client_snapshot,items,total,status,created_at,updated_at', client_id: `eq.${customerId}`, order: 'created_at.desc', limit: '200' });
    const rows = await db(`svl_orders?${query}`);
    return reply((rows || []).map(orderRecord));
  }

  if (path === '/api/orders' && method === 'POST') {
    const customerId = sessionCustomer(request);
    const input = await readBody(request);
    if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 50) throw new HttpError(400, 'Adicione de 1 a 50 produtos ao pedido.');
    const customers = await db(`svl_customers?id=eq.${encodeURIComponent(customerId)}&select=id,nome,documento,telefone,endereco,email`);
    const customer = customers?.[0];
    if (!customer) throw new HttpError(401, 'Entre novamente na sua conta para continuar.');
    const orderItems = input.items.map(item => {
      const product = products.find(entry => entry.id === String(item.productId));
      const qty = Number(item.qty);
      if (!product || !Number.isInteger(qty) || qty < 1 || qty > 999) throw new HttpError(400, 'Um produto ou quantidade do pedido não é válido. Atualize a vitrine e tente novamente.');
      return { productId: product.id, sku: product.sku, name: product.name, price: product.price, qty };
    });
    const total = orderItems.reduce((sum, item) => sum + item.price * item.qty, 0);
    const rows = await db('svl_orders?select=id,number,client_id,client_snapshot,items,total,status,created_at,updated_at', {
      method: 'POST',
      prefer: 'return=representation',
      body: {
        client_id: customer.id,
        client_snapshot: publicCustomer(customer),
        items: orderItems,
        total: total.toFixed(2),
        status: 'novo'
      }
    });
    return reply({ order: orderRecord(rows[0]) }, 201);
  }

  if (path === '/api/orders' && method === 'GET') {
    requireAdmin(request);
    const query = new URLSearchParams({ select: 'id,number,client_id,client_snapshot,items,total,status,created_at,updated_at', order: 'created_at.desc', limit: '500' });
    const rows = await db(`svl_orders?${query}`);
    return reply((rows || []).map(orderRecord));
  }

  if (path === '/api/orders/status' && method === 'POST') {
    requireAdmin(request);
    const input = await readBody(request);
    const id = String(input.id || '');
    const status = String(input.status || '');
    if (!/^[0-9a-f-]{36}$/i.test(id) || !ORDER_STATUSES.has(status)) throw new HttpError(400, 'Pedido ou andamento inválido.');
    const query = new URLSearchParams({ id: `eq.${id}`, select: 'id,number,client_id,client_snapshot,items,total,status,created_at,updated_at' });
    const rows = await db(`svl_orders?${query}`, {
      method: 'PATCH',
      prefer: 'return=representation',
      body: { status, updated_at: new Date().toISOString() }
    });
    if (!rows?.length) throw new HttpError(404, 'Pedido não encontrado.');
    return reply({ saved: true, order: orderRecord(rows[0]) });
  }

  throw new HttpError(404, 'Rota não encontrada.');
}

export default async function api(request) {
  try { return await handle(request); }
  catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    if (status === 500) console.error('Falha na função da API do Sistema Vendas Light.');
    return reply({ error: error instanceof HttpError ? error.message : 'Não foi possível concluir a solicitação. Confira as configurações do serviço.' }, status);
  }
}

export const config = { path: '/api/*' };
