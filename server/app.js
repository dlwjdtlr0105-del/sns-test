import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';

const deriveKey = promisify(scrypt);
const SESSION_AGE = 30 * 24 * 60 * 60;
const CATEGORIES = new Set(['일상', '고민', '혼잣말']);
const COLORS = new Set(['cream', 'lavender', 'peach', 'sage', 'blue']);
const ANONYMOUS_NAMES = ['달', '숲', '파도', '바람', '별', '구름', '새벽', '햇살', '우주', '여름', '나무', '고래'];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function json(response, status, data, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  response.end(JSON.stringify(data));
}

function hash(value) { return createHash('sha256').update(value).digest('hex'); }
function anonymousName(userId, postId) {
  const index = Number.parseInt(hash(`${postId}:${userId}`).slice(0, 8), 16) % ANONYMOUS_NAMES.length;
  return `익명의 ${ANONYMOUS_NAMES[index]}`;
}

async function readJson(request) {
  const type = request.headers['content-type']?.split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') throw new HttpError(400, 'JSON 형식으로 요청해 주세요.');
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 16_384) throw new HttpError(413, '요청 내용이 너무 큽니다.');
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error();
    return body;
  } catch { throw new HttpError(400, '요청 내용을 확인해 주세요.'); }
}

function textField(value, max, label) {
  if (typeof value !== 'string' || !value.trim() || [...value.trim()].length > max) {
    throw new HttpError(400, `${label}은 1~${max}자로 입력해 주세요.`);
  }
  return value.trim();
}

function credentials(body) {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, '올바른 이메일 주소를 입력해 주세요.');
  }
  if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128) {
    throw new HttpError(400, '비밀번호는 8~128자로 입력해 주세요.');
  }
  return { email, password: body.password };
}

function seedDemo(db) {
  if (db.prepare('SELECT 1 FROM posts LIMIT 1').get()) return;
  const userId = randomUUID();
  db.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
    .run(userId, `demo-${userId}@example.invalid`, null, new Date().toISOString());
  const examples = [
    ['일상', 'cream', '오늘은 퇴근길에 한 정거장 먼저 내렸어요.\n늘 지나치던 골목에 작은 꽃집이 있더라고요.\n가끔은 조금 돌아가는 길도 괜찮은 것 같아요.'],
    ['혼잣말', 'lavender', '어른이 되면 마음도 단단해질 줄 알았는데,\n그냥 서툰 마음을 잘 숨기게 되는 거였나 봐요.\n오늘 하루도 버틴 우리 모두에게 박수.'],
    ['고민', 'peach', '요즘 하고 싶은 일과 잘하는 일 사이에서 고민하고 있어요.\n여러분은 어떤 쪽을 선택하셨나요?\n정답은 없겠지만, 다른 사람의 이야기가 듣고 싶어요.'],
    ['일상', 'sage', '주말 아침, 커피를 내리고 창문을 열었어요.\n별일 없는 하루가 이렇게 좋을 수 있구나.\n이런 순간을 오래 기억하고 싶어요.'],
    ['혼잣말', 'blue', '누군가에게는 별거 아닌 한마디가\n나에게는 하루를 버틸 힘이 되기도 해요.\n여기 있는 당신도 오늘 수고 많았어요.'],
    ['일상', 'peach', '동네 산책하다가 고양이랑 5분 동안 눈을 마주쳤어요.\n아무 말도 안 했는데 왠지 위로받은 기분.'],
    ['고민', 'cream', '친구에게 먼저 연락하는 게 늘 저인 것 같아요.\n그렇다고 연락을 안 하면 사이가 멀어질까 봐 걱정돼요.\n관계의 속도를 맞추는 건 참 어렵네요.'],
    ['혼잣말', 'lavender', '아무것도 증명하지 않아도 되는 곳이 필요했어요.\n오늘만큼은 그냥 나로 있어도 괜찮겠죠?'],
  ];
  const insert = db.prepare('INSERT INTO posts (id, user_id, content, category, color, created_at, is_demo) VALUES (?, ?, ?, ?, ?, ?, 1)');
  const now = Date.now();
  examples.forEach(([category, color, content], i) => {
    insert.run(randomUUID(), userId, content, category, color, new Date(now - (i + 1) * 27 * 60_000).toISOString());
  });
}

/** Build an isolated application. Listening is explicit so tests can use an ephemeral port. */
export function createApp({
  dbPath = resolve('data/app.sqlite'),
  staticDir = resolve('dist'),
  seed = true,
  allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(value => value.trim()).filter(Boolean) ?? [],
  secureCookies = process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production',
} = {}) {
  if (dbPath !== ':memory:') mkdirSync(dirname(resolve(dbPath)), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), content TEXT NOT NULL,
      category TEXT NOT NULL, color TEXT NOT NULL, created_at TEXT NOT NULL,
      is_demo INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS likes (
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (post_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS saves (
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (post_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id), content TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS posts_created_at ON posts(created_at DESC);
    CREATE INDEX IF NOT EXISTS comments_post_id ON comments(post_id, created_at);
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
  `);
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  if (seed) seedDemo(db);

  const limits = new Map();
  function rateLimit(request, type, max, windowMs) {
    const key = `${type}:${request.socket.remoteAddress ?? 'unknown'}`;
    const now = Date.now();
    let entry = limits.get(key);
    if (!entry || entry.until < now) { entry = { count: 0, until: now + windowMs }; limits.set(key, entry); }
    if (++entry.count > max) throw new HttpError(429, '잠시 쉬었다가 다시 시도해 주세요.');
    if (limits.size > 10000) for (const [k, value] of limits) if (value.until < now) limits.delete(k);
  }

  function getSession(request) {
    const token = request.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith('sai_session='))?.slice('sai_session='.length);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    return db.prepare(`SELECT users.id, users.email FROM sessions JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?`).get(hash(token), Date.now()) ?? null;
  }

  function requireUser(request) {
    const user = getSession(request);
    if (!user) throw new HttpError(401, '로그인하고 마음을 나눠 주세요.');
    return user;
  }

  function cookie(token, age = SESSION_AGE) {
    return `sai_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secureCookies ? '; Secure' : ''}`;
  }

  function sessionCookie(userId) {
    const token = randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions(token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(hash(token), userId, Date.now() + SESSION_AGE * 1000);
    return cookie(token);
  }

  function getPost(id) {
    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
    if (!post) throw new HttpError(404, '이야기를 찾을 수 없어요.');
    return post;
  }

  function presentPost(post, user) {
    return {
      id: post.id, content: post.content, category: post.category, color: post.color,
      authorName: anonymousName(post.user_id, post.id), createdAt: post.created_at,
      likesCount: Number(db.prepare('SELECT COUNT(*) AS count FROM likes WHERE post_id = ?').get(post.id).count),
      commentsCount: Number(db.prepare('SELECT COUNT(*) AS count FROM comments WHERE post_id = ?').get(post.id).count),
      liked: Boolean(user && db.prepare('SELECT 1 FROM likes WHERE post_id = ? AND user_id = ?').get(post.id, user.id)),
      saved: Boolean(user && db.prepare('SELECT 1 FROM saves WHERE post_id = ? AND user_id = ?').get(post.id, user.id)),
      isMine: Boolean(user && post.user_id === user.id), isDemo: Boolean(post.is_demo),
    };
  }

  function presentComment(comment, post, user) {
    return {
      id: comment.id, content: comment.content, createdAt: comment.created_at,
      authorName: comment.user_id === post.user_id ? '글쓴이' : anonymousName(comment.user_id, post.id),
      isMine: Boolean(user && comment.user_id === user.id),
    };
  }

  function guardMutation(request) {
    if (request.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, '허용되지 않은 요청입니다.');
    const origin = request.headers.origin;
    if (!origin) return;
    try {
      const parsed = new URL(origin);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
      if (parsed.host !== request.headers.host && !allowedOrigins.includes(parsed.origin)) throw new Error();
    } catch { throw new HttpError(403, '허용되지 않은 요청입니다.'); }
  }

  const server = createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'same-origin');
    response.setHeader('X-Frame-Options', 'DENY');
    try {
      const url = new URL(request.url, 'http://localhost');
      const path = url.pathname;
      const method = request.method;
      if (!['GET', 'HEAD'].includes(method) && path.startsWith('/api/')) guardMutation(request);

      if (path === '/api/session' && method === 'GET') {
        const user = getSession(request);
        return json(response, 200, { user: user ? { email: user.email } : null });
      }

      if ((path === '/api/auth/signup' || path === '/api/auth/login') && method === 'POST') {
        rateLimit(request, 'auth', 30, 15 * 60_000);
        const { email, password } = credentials(await readJson(request));
        let user;
        if (path.endsWith('/signup')) {
          if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, '이미 가입한 이메일이에요. 로그인해 주세요.');
          const salt = randomBytes(16).toString('hex');
          const key = await deriveKey(password, salt, 64);
          user = { id: randomUUID(), email };
          try {
            db.prepare('INSERT INTO users(id, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
              .run(user.id, email, `${salt}:${key.toString('hex')}`, new Date().toISOString());
          } catch (error) {
            if (error.code?.includes('CONSTRAINT') || String(error.message).includes('UNIQUE')) throw new HttpError(409, '이미 가입한 이메일이에요. 로그인해 주세요.');
            throw error;
          }
        } else {
          user = db.prepare('SELECT id, email, password_hash FROM users WHERE email = ?').get(email);
          const [salt, stored] = (user?.password_hash ?? '00000000000000000000000000000000:' + '0'.repeat(128)).split(':');
          const key = await deriveKey(password, salt, 64);
          if (!user?.password_hash || !timingSafeEqual(key, Buffer.from(stored, 'hex'))) throw new HttpError(401, '이메일 또는 비밀번호를 확인해 주세요.');
        }
        return json(response, path.endsWith('/signup') ? 201 : 200, { user: { email: user.email } }, { 'Set-Cookie': sessionCookie(user.id) });
      }

      if (path === '/api/auth/logout' && method === 'POST') {
        const raw = request.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith('sai_session='))?.slice('sai_session='.length);
        if (raw) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash(raw));
        return json(response, 200, { user: null }, { 'Set-Cookie': cookie('', 0) });
      }

      if (path === '/api/posts' && method === 'GET') {
        const user = getSession(request);
        const view = url.searchParams.get('view') ?? 'all';
        const sort = url.searchParams.get('sort') ?? 'latest';
        const category = url.searchParams.get('category');
        const query = (url.searchParams.get('q') ?? '').trim();
        const rawOffset = url.searchParams.get('offset') ?? '0';
        const rawLimit = url.searchParams.get('limit') ?? '12';
        const offset = Number(rawOffset), limit = Number(rawLimit);
        if (!/^\d+$/.test(rawOffset) || !Number.isSafeInteger(offset) || offset < 0 ||
            !/^\d+$/.test(rawLimit) || !Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
          throw new HttpError(400, '목록 위치와 개수를 확인해 주세요.');
        }
        if (!['all', 'mine', 'saved'].includes(view) || !['latest', 'popular'].includes(sort)) throw new HttpError(400, '목록 조건을 확인해 주세요.');
        if (category && category !== 'all' && !CATEGORIES.has(category)) throw new HttpError(400, '카테고리를 확인해 주세요.');
        if (query.length > 200) throw new HttpError(400, '검색어는 200자 이내로 입력해 주세요.');
        if (view !== 'all' && !user) throw new HttpError(401, '로그인하고 내 이야기를 확인해 주세요.');
        const where = [], params = [];
        if (view === 'mine') { where.push('p.user_id = ?'); params.push(user.id); }
        if (view === 'saved') { where.push('EXISTS (SELECT 1 FROM saves s WHERE s.post_id = p.id AND s.user_id = ?)'); params.push(user.id); }
        if (category && category !== 'all') { where.push('p.category = ?'); params.push(category); }
        if (query) { where.push('instr(lower(p.content), lower(?)) > 0'); params.push(query); }
        const condition = where.length ? `WHERE ${where.join(' AND ')}` : '';
        const order = sort === 'popular' ? '(SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) DESC, p.created_at DESC, p.id DESC' : 'p.created_at DESC, p.id DESC';
        const posts = db.prepare(`SELECT p.* FROM posts p ${condition} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...params, limit, offset);
        const total = Number(db.prepare(`SELECT COUNT(*) AS count FROM posts p ${condition}`).get(...params).count);
        return json(response, 200, { posts: posts.map(post => presentPost(post, user)), total, hasMore: offset + posts.length < total });
      }

      if (path === '/api/posts' && method === 'POST') {
        const user = requireUser(request);
        rateLimit(request, `write:${user.id}`, 60, 60_000);
        const body = await readJson(request);
        const content = textField(body.content, 1000, '이야기');
        const category = body.category ?? '일상', color = body.color ?? 'cream';
        if (!CATEGORIES.has(category) || !COLORS.has(color)) throw new HttpError(400, '카테고리 또는 배경색을 확인해 주세요.');
        const id = randomUUID();
        db.prepare('INSERT INTO posts(id, user_id, content, category, color, created_at) VALUES (?, ?, ?, ?, ?, ?)')
          .run(id, user.id, content, category, color, new Date().toISOString());
        return json(response, 201, { post: presentPost(getPost(id), user) });
      }

      const postRoute = path.match(/^\/api\/posts\/([^/]+)(?:\/(like|save|comments))?$/);
      if (postRoute) {
        const [, id, action] = postRoute;
        const post = getPost(id);
        if (!action && method === 'DELETE') {
          const user = requireUser(request);
          if (post.user_id !== user.id) throw new HttpError(403, '내가 쓴 이야기만 지울 수 있어요.');
          db.prepare('DELETE FROM posts WHERE id = ?').run(id);
          return json(response, 200, { deleted: true });
        }
        if ((action === 'like' || action === 'save') && method === 'POST') {
          const user = requireUser(request);
          rateLimit(request, `react:${user.id}`, 180, 60_000);
          const table = action === 'like' ? 'likes' : 'saves';
          const exists = db.prepare(`SELECT 1 FROM ${table} WHERE post_id = ? AND user_id = ?`).get(id, user.id);
          if (exists) db.prepare(`DELETE FROM ${table} WHERE post_id = ? AND user_id = ?`).run(id, user.id);
          else db.prepare(`INSERT INTO ${table}(post_id, user_id) VALUES (?, ?)`).run(id, user.id);
          if (action === 'save') return json(response, 200, { saved: !exists });
          return json(response, 200, { liked: !exists, likesCount: Number(db.prepare('SELECT COUNT(*) AS count FROM likes WHERE post_id = ?').get(id).count) });
        }
        if (action === 'comments' && method === 'GET') {
          const user = getSession(request);
          const comments = db.prepare('SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC LIMIT 500').all(id);
          return json(response, 200, { comments: comments.map(comment => presentComment(comment, post, user)) });
        }
        if (action === 'comments' && method === 'POST') {
          const user = requireUser(request);
          rateLimit(request, `write:${user.id}`, 60, 60_000);
          const content = textField((await readJson(request)).content, 300, '댓글');
          const commentId = randomUUID();
          db.prepare('INSERT INTO comments(id, post_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)')
            .run(commentId, id, user.id, content, new Date().toISOString());
          const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(commentId);
          return json(response, 201, { comment: presentComment(comment, post, user) });
        }
      }

      if (path.startsWith('/api/')) throw new HttpError(404, '요청하신 기능을 찾을 수 없어요.');
      if (method !== 'GET' && method !== 'HEAD') throw new HttpError(405, '지원하지 않는 요청입니다.');
      let decoded;
      try { decoded = decodeURIComponent(path); } catch { throw new HttpError(400, '주소를 확인해 주세요.'); }
      if (decoded.includes('\0') || decoded.split(/[\\/]/).some(part => part === '..')) throw new HttpError(403, '허용되지 않은 주소입니다.');
      const root = resolve(staticDir);
      let file = resolve(root, `.${decoded}`);
      if (file !== root && !file.startsWith(root + sep)) throw new HttpError(403, '허용되지 않은 주소입니다.');
      try {
        if (!statSync(file).isFile()) file = resolve(root, 'index.html');
      } catch { file = extname(decoded) ? file : resolve(root, 'index.html'); }
      let content;
      try {
        const realRoot = realpathSync(root), realFile = realpathSync(file);
        if (!realFile.startsWith(realRoot + sep)) throw new HttpError(403, '허용되지 않은 주소입니다.');
        content = readFileSync(realFile);
      } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(404, '화면을 준비 중이에요. npm run dev 또는 npm run build를 실행해 주세요.');
      }
      const revalidate = extname(file) === '.html' || extname(file) === '.webmanifest' || file === resolve(root, 'sw.js');
      response.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream', 'Cache-Control': revalidate ? 'no-cache' : 'public, max-age=3600' });
      response.end(method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (!response.headersSent) json(response, error.status ?? 500, { error: error.status ? error.message : '잠시 문제가 생겼어요. 다시 시도해 주세요.' });
      else response.end();
      if (!error.status) console.error('Request failed:', error.message);
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;

  return {
    server, db,
    async close() {
      if (server.listening) await new Promise((done, reject) => server.close(error => error ? reject(error) : done()));
      db.close();
    },
  };
}
