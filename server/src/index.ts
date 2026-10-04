import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authenticate, type User } from './auth.js';
import { startBot, startScheduler } from './bot.js';
import { initDb } from './db.js';
import { HttpError, readBody, Router, sendJson, serveStatic } from './http.js';
import { migrate } from './migrations.js';
import { moneyRoutes } from './routes/money.js';
import { orderRoutes } from './routes/orders.js';
import { reportRoutes } from './routes/reports.js';
import { settingsRoutes } from './routes/settings.js';

const here = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(here, 'web');

const router = new Router<User>();
router.get('/api/me', ({ user }) => user);
orderRoutes(router);
moneyRoutes(router);
reportRoutes(router);
settingsRoutes(router);

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://local');
  try {
    if (url.pathname === '/health') return sendJson(res, 200, { ok: true });
    if (!url.pathname.startsWith('/api/')) return serveStatic(res, WEB_ROOT, url.pathname);

    const m = router.match(req.method || 'GET', url.pathname);
    if (!m) throw new HttpError(404, 'Не найдено');
    const user = await authenticate(req);
    const reqBody = await readBody(req);
    const result = await m.handler({ req, res, params: m.params, query: url.searchParams, body: reqBody, user });
    if (!res.headersSent) sendJson(res, 200, result);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error(req.method, url.pathname, e);
    if (!res.headersSent) sendJson(res, status, { error: e instanceof HttpError ? e.message : 'Ошибка сервера. Попробуйте ещё раз.' });
  }
});

async function main() {
  await initDb();
  await migrate();
  const port = Number(process.env.PORT || 3000);
  server.listen(port, () => console.log(`HAYANMI запущен на порту ${port}`));
  await startBot();
  startScheduler();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
