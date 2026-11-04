import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Bookmark, Check, ChevronDown, ChevronRight, Coffee, Feather, Flower2, Heart, HelpCircle, Leaf, LoaderCircle, LogOut, MessageCircle, Moon, MoreHorizontal, Plus, Search, Send, ShieldCheck, Sparkles, Sprout, Sun, Trash2, Users, Wind, X } from 'lucide-react';

const CATEGORIES = ['모든 이야기', '일상', '고민', '혼잣말'];
const COLORS = ['cream', 'lavender', 'peach', 'sage', 'blue'];
const ICONS = { cream: Sun, lavender: Moon, peach: Flower2, sage: Leaf, blue: Wind };

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  let data;
  try { data = await response.json(); } catch { throw new Error('잠시 연결이 끊겼어요. 다시 시도해 주세요.'); }
  if (!response.ok) { const error = new Error(data.error || '요청을 처리하지 못했어요.'); error.status = response.status; throw error; }
  return data;
}

function ago(date) {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60000));
  if (mins < 1) return '방금 전';
  if (mins < 60) return `${mins}분 전`;
  if (mins < 1440) return `${Math.floor(mins / 60)}시간 전`;
  if (mins < 10080) return `${Math.floor(mins / 1440)}일 전`;
  return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric' }).format(new Date(date));
}

function Logo({ small = false }) {
  return <div className={`brand ${small ? 'small' : ''}`}><span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 40 40"><ellipse cx="16" cy="20" rx="9" ry="13" transform="rotate(-25 16 20)"/><ellipse cx="24" cy="20" rx="9" ry="13" transform="rotate(25 24 20)"/></svg></span><span>사이<span className="brand-dot">.</span></span></div>;
}

function HeroArt() {
  return <div className="hero-art" aria-hidden="true">
    <div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/>
    <span className="art-star star-one">✳</span><span className="art-star star-two">✦</span>
    <div className="art-note back-note"><span className="note-line"/><span className="note-line short"/><span className="note-heart">♡</span></div>
    <div className="art-note front-note"><span className="tiny-sun"><Sun size={23} strokeWidth={1.3}/></span><p>이름은 몰라도,<br/>마음은 닿으니까.</p><div className="note-footer"><span/><Heart size={13}/></div></div>
    <span className="art-leaf"><Sprout size={35} strokeWidth={1.5}/></span>
  </div>;
}

function Modal({ children, onClose, title, className = '' }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const dialog = ref.current;
    const focusable = () => [...dialog.querySelectorAll('button, input, textarea, a[href], select, [tabindex="0"]')].filter(el => !el.disabled && el.offsetParent !== null);
    const timer = setTimeout(() => (dialog.querySelector('[data-autofocus]') || focusable()[0] || dialog).focus(), 30);
    const onKey = event => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key === 'Tab') {
        const elements = focusable();
        const first = elements[0], last = elements[elements.length - 1];
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { clearTimeout(timer); document.body.style.overflow = originalOverflow; document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><section ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="modal-title" className={`modal ${className}`}><button className="icon-button modal-close" onClick={onClose} aria-label="닫기"><X size={21}/></button><h2 id="modal-title" className="sr-only">{title}</h2>{children}</section></div>;
}

function AuthModal({ onClose, onSuccess, initialMode = 'signup' }) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault(); setError(''); setPending(true);
    try { const data = await api(`/auth/${mode}`, { method: 'POST', body: JSON.stringify({ email, password }) }); onSuccess(data.user); }
    catch (err) { setError(err.message); }
    finally { setPending(false); }
  }
  return <Modal title={mode === 'signup' ? '사이 회원가입' : '사이 로그인'} onClose={onClose} className="auth-modal">
    <Logo small/><div className="auth-illustration"><Moon size={29} strokeWidth={1.4}/><span>✦</span></div>
    <h3>{mode === 'signup' ? <>당신의 마음이<br/>쉬어갈 자리를 만들어요.</> : <>다시 만나 반가워요.<br/>오늘은 어떤 하루였나요?</>}</h3>
    <p className="auth-intro">이름을 꺼내지 않아도 괜찮아요.<br/>여기서는 당신의 이야기만으로 충분해요.</p>
    <form onSubmit={submit}>
      <label className="field-label">이메일<input data-autofocus type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required maxLength={254}/></label>
      <label className="field-label">비밀번호<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={mode === 'signup' ? '8자 이상 입력해 주세요' : '비밀번호를 입력해 주세요'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={8} maxLength={128} required/></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button auth-submit" disabled={pending}>{pending ? <LoaderCircle className="spin" size={18}/> : mode === 'signup' ? '익명으로 시작하기' : '로그인'}{!pending && <ArrowRight size={17}/>}</button>
    </form>
    <p className="auth-privacy"><ShieldCheck size={14}/> 이메일은 다른 사람에게 공개되지 않아요.</p>
    <p className="auth-switch">{mode === 'signup' ? '이미 사이에 머문 적 있나요?' : '아직 계정이 없나요?'} <button onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setError(''); }}>{mode === 'signup' ? '로그인' : '회원가입'}</button></p>
  </Modal>;
}

function Composer({ onClose, onPublish, prompt = '' }) {
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('일상');
  const [color, setColor] = useState('cream');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const textarea = useRef(null);
  async function submit(event) {
    event.preventDefault(); if (!content.trim() || pending) return;
    setPending(true); setError('');
    try { const data = await api('/posts', { method: 'POST', body: JSON.stringify({ content: content.trim(), category, color }) }); onPublish(data.post); }
    catch (err) { setError(err.message); setPending(false); }
  }
  function close() { if (!pending && (!content.trim() || window.confirm('쓰던 이야기를 닫을까요? 작성 중인 내용은 사라져요.'))) onClose(); }
  return <Modal title="이야기 쓰기" onClose={close} className="composer-modal">
    <div className="modal-eyebrow"><Feather size={17}/> 마음을 남기는 시간</div><h3>지금, 어떤 마음인가요?</h3><p className="modal-description">잘 쓴 글이 아니어도 괜찮아요. 당신의 이야기를 들려주세요.</p>
    <form onSubmit={submit}>
      <div className="composer-categories" aria-label="이야기 주제">{CATEGORIES.slice(1).map(item => <button type="button" className={category === item ? 'selected' : ''} key={item} onClick={() => setCategory(item)} aria-pressed={category === item}>{item}</button>)}</div>
      <div className={`writing-paper ${color}`}><div className="paper-author"><Moon size={17}/> 이름 없는 나</div><textarea ref={textarea} data-autofocus aria-label="이야기 내용" value={content} onChange={e => setContent(e.target.value)} placeholder={prompt || '오늘 있었던 작은 일, 문득 떠오른 생각…\n누구에게도 하지 못한 말을 여기에 남겨보세요.'} maxLength={1000} required/><span className="character-count">{content.length} / 1,000</span></div>
      <div className="paper-palette"><span>마음에 어울리는 색</span><div>{COLORS.map(c => <button key={c} type="button" aria-label={`${c} 배경`} aria-pressed={color === c} onClick={() => setColor(c)} className={`color-swatch ${c} ${color === c ? 'active' : ''}`}>{color === c && <Check size={13}/>}</button>)}</div></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="compose-footer"><span><ShieldCheck size={15}/> 익명으로 모두에게 전해져요</span><button className="primary-button" disabled={!content.trim() || pending}>{pending ? <LoaderCircle className="spin" size={17}/> : <><span>이야기 남기기</span><ArrowRight size={16}/></>}</button></div>
    </form>
  </Modal>;
}

function PostCard({ post, onLike, onSave, onComments, onDelete }) {
  const [menu, setMenu] = useState(false);
  const [working, setWorking] = useState('');
  const Icon = ICONS[post.color] || Moon;
  async function action(type, fn) { if (working) return; setWorking(type); try { await fn(post); } finally { setWorking(''); } }
  return <article className={`post-card ${post.color || 'cream'}`}>
    <div className="post-top"><div className="post-author"><span className="avatar"><Icon size={17} strokeWidth={1.5}/></span><span>{post.authorName || '익명의 마음'}</span>{post.isMine && <span className="mine-badge">나</span>}</div><div className="post-meta"><time dateTime={post.createdAt}>{ago(post.createdAt)}</time>{post.isMine && <div className="post-menu"><button className="icon-button" aria-label="내 글 관리" aria-expanded={menu} onClick={() => setMenu(!menu)}><MoreHorizontal size={18}/></button>{menu && <button className="delete-post" onClick={() => { setMenu(false); onDelete(post); }}><Trash2 size={13}/> 삭제하기</button>}</div>}</div></div>
    <button className="post-body" onClick={() => onComments(post)} aria-label={`이야기 읽기: ${post.content.slice(0,25)}`}><p>{post.content}</p></button>
    <div className="post-tag-row"><span className="post-tag">{post.category}</span>{post.isDemo && <span className="demo-badge">예시 이야기</span>}</div>
    <div className="post-actions"><button onClick={() => action('like', onLike)} disabled={!!working} className={post.liked ? 'liked' : ''} aria-label={`공감 ${post.likesCount}개`} aria-pressed={post.liked}><Heart size={17} fill={post.liked ? 'currentColor' : 'none'}/><span>{post.likesCount || '공감'}</span></button><button onClick={() => onComments(post)} aria-label={`댓글 ${post.commentsCount}개`}><MessageCircle size={17}/><span>{post.commentsCount || '댓글'}</span></button><button className={`save-button ${post.saved ? 'saved' : ''}`} onClick={() => action('save', onSave)} disabled={!!working} aria-label={post.saved ? '이야기 저장 취소' : '이야기 저장'} aria-pressed={post.saved}><Bookmark size={17} fill={post.saved ? 'currentColor' : 'none'}/></button></div>
  </article>;
}

function Comments({ post, user, onClose, onAuth, onUpdated, toast }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [content, setContent] = useState('');
  const [pending, setPending] = useState(false);
  const Icon = ICONS[post.color] || Moon;
  useEffect(() => { let active = true; api(`/posts/${post.id}/comments`).then(data => { if (active) setComments(data.comments); }).catch(err => { if(active) setError(err.message); }).finally(() => { if(active) setLoading(false); }); return () => { active = false; }; }, [post.id]);
  async function submit(event) {
    event.preventDefault(); if (!user) { onAuth(); return; } if (!content.trim() || pending) return;
    setPending(true); setError('');
    try { const data = await api(`/posts/${post.id}/comments`, { method: 'POST', body: JSON.stringify({ content: content.trim() }) }); setComments(prev => [...prev, data.comment]); setContent(''); onUpdated(post.id); toast('따뜻한 한마디를 남겼어요.'); }
    catch (err) { setError(err.message); }
    finally { setPending(false); }
  }
  return <Modal title="이야기와 댓글" onClose={onClose} className="comments-modal">
    <div className={`detail-post ${post.color}`}><div className="post-author"><span className="avatar"><Icon size={18}/></span>{post.authorName}<span className="detail-time">{ago(post.createdAt)}</span></div><p>{post.content}</p><div className="post-tag-row"><span className="post-tag">{post.category}</span>{post.isDemo && <span className="demo-badge">예시 이야기</span>}</div></div>
    <div className="comments-heading"><h3>마음을 잇는 한마디 <span>{comments.length}</span></h3><span><Heart size={13}/> 다정하게 나눠요</span></div>
    <div className="comments-list" aria-busy={loading}>{loading ? <LoaderCircle className="spin comments-loader" size={22}/> : comments.length ? comments.map(comment => <div className="comment" key={comment.id}><div className="comment-avatar"><Sprout size={17}/></div><div><div className="comment-author">{comment.authorName}{comment.isMine && <span className="mine-badge">나</span>}<time>{ago(comment.createdAt)}</time></div><p>{comment.content}</p></div></div>) : <div className="no-comments"><MessageCircle size={25} strokeWidth={1.2}/><p>첫 번째 다정함을 남겨보세요.</p></div>}</div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <form className="comment-form" onSubmit={submit}><textarea aria-label="댓글 내용" placeholder={user ? '따뜻한 한마디를 남겨주세요.' : '로그인하고 마음을 나눠보세요.'} value={content} onChange={e => setContent(e.target.value)} maxLength={300} rows={2} readOnly={!user} onClick={() => !user && onAuth()}/><div><span>이름 없이, 다정하게</span><button className="primary-button" disabled={pending || (!!user && !content.trim())}>{pending ? <LoaderCircle className="spin" size={16}/> : user ? <><Send size={14}/> 보내기</> : '로그인하기'}</button></div></form>
  </Modal>;
}

function App() {
  const [user, setUser] = useState(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [posts, setPosts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState('all');
  const [category, setCategory] = useState('모든 이야기');
  const [sort, setSort] = useState('latest');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [auth, setAuth] = useState(null);
  const [composer, setComposer] = useState(null);
  const [comments, setComments] = useState(null);
  const [info, setInfo] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [toastText, setToastText] = useState('');
  const toastTimer = useRef(null);
  const search = useRef(null);
  const feed = useRef(null);
  const pendingAction = useRef(null);
  const listVersion = useRef(0);

  function toast(message) { setToastText(message); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToastText(''), 3200); }
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  useEffect(() => { api('/session').then(data => setUser(data.user)).catch(err => setError(err.message)).finally(() => setSessionReady(true)); }, []);
  useEffect(() => { const t = setTimeout(() => setDebouncedQuery(query.trim()), 250); return () => clearTimeout(t); }, [query]);
  useEffect(() => { const handle = event => { if ((event.ctrlKey || event.metaKey) && event.key === 'k') { event.preventDefault(); search.current?.focus(); } }; document.addEventListener('keydown', handle); return () => document.removeEventListener('keydown', handle); }, []);
  useEffect(() => {
    if (!sessionReady) return;
    const controller = new AbortController();
    listVersion.current += 1;
    setLoadingMore(false);
    setLoading(true); setError('');
    const params = new URLSearchParams({ view, sort, q: debouncedQuery });
    if (category !== '모든 이야기') params.set('category', category);
    api(`/posts?${params}`, { signal: controller.signal }).then(data => { setPosts(data.posts); setTotal(data.total); setHasMore(data.hasMore); }).catch(err => { if (!controller.signal.aborted) { if (err.status === 401) { setUser(null); setView('all'); setAuth('login'); } else setError(err.message); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [view, sort, category, debouncedQuery, refresh, sessionReady, user]);

  async function loadMore() {
    if (loadingMore || loading) return;
    const version = listVersion.current;
    setLoadingMore(true);
    const params = new URLSearchParams({ view, sort, q: debouncedQuery, offset: String(posts.length) });
    if(category !== '모든 이야기') params.set('category', category);
    try {
      const data = await api(`/posts?${params}`);
      if (version !== listVersion.current) return;
      setPosts(prev => [...prev, ...data.posts.filter(p => !prev.some(existing => existing.id === p.id))]);
      setTotal(data.total); setHasMore(data.hasMore);
    } catch(err) { if(version === listVersion.current) toast(err.message); }
    finally { if(version === listVersion.current) setLoadingMore(false); }
  }

  function requestAuth(action, mode = 'signup') { pendingAction.current = action; setAuth(mode); }
  function write(prompt = '') { if (!sessionReady) return; if (!user) { requestAuth(() => setComposer({ prompt })); return; } setComposer({ prompt }); }
  function navigate(next) {
    if (next !== 'all' && !user) { requestAuth(() => { setView(next); setCategory('모든 이야기'); setQuery(''); }); return; }
    setView(next); setCategory('모든 이야기'); setQuery('');
  }
  function signedIn(nextUser) { setUser(nextUser); setAuth(null); toast('이름 없이, 편안하게 머물러요.'); const action = pendingAction.current; pendingAction.current = null; action?.(); }
  async function logout() { try { await api('/auth/logout', { method: 'POST' }); setUser(null); setProfileOpen(false); setView('all'); toast('다음에 또 만나요.'); } catch (err) { toast(err.message); } }
  async function interact(post, action) {
    if (!user) { requestAuth(() => toast('이제 마음을 나눌 수 있어요.')); return; }
    const version = listVersion.current;
    try {
      const data = await api(`/posts/${post.id}/${action}`, { method: 'POST' });
      if (version !== listVersion.current) {
        setRefresh(n => n + 1);
      } else {
        setPosts(prev => prev.map(p => p.id === post.id ? { ...p, ...data } : p).filter(p => view !== 'saved' || p.saved));
        if (action === 'save' && view === 'saved' && !data.saved) setTotal(n => Math.max(0, n - 1));
      }
      if (action === 'save') toast(data.saved ? '이야기를 조용히 간직했어요.' : '저장한 이야기에서 지웠어요.');
    }
    catch (err) { if (err.status === 401) { setUser(null); requestAuth(null, 'login'); } toast(err.message); }
  }
  async function deletePost(post) {
    if (!window.confirm('이 이야기를 지울까요? 삭제한 이야기는 되돌릴 수 없어요.')) return;
    const version = listVersion.current;
    try { await api(`/posts/${post.id}`, { method: 'DELETE' }); if(version !== listVersion.current) setRefresh(n => n + 1); else { setPosts(prev => prev.filter(p => p.id !== post.id)); setTotal(n => Math.max(0,n - 1)); } toast('이야기를 지웠어요.'); } catch(err) { toast(err.message); }
  }
  const title = view === 'mine' ? '내가 남긴 이야기' : view === 'saved' ? '간직한 이야기' : '이야기 둘러보기';

  return <div className="app-shell">
    <aside className="sidebar">
      <button className="brand-link" onClick={() => navigate('all')} aria-label="사이 홈"><Logo/></button><p className="brand-caption">이름 없이 나누는 마음</p>
      <nav className="main-nav" aria-label="주 메뉴">
        <span className="nav-label">우리 사이</span>
        <button className={view === 'all' ? 'active' : ''} onClick={() => navigate('all')}><span className="nav-icon"><Wind size={20}/></span>이야기 둘러보기{view === 'all' && <span className="nav-active-dot"/>}</button>
        <button className={view === 'mine' ? 'active' : ''} onClick={() => navigate('mine')}><span className="nav-icon"><Feather size={19}/></span>내가 남긴 이야기{view === 'mine' && <span className="nav-active-dot"/>}</button>
        <button className={view === 'saved' ? 'active' : ''} onClick={() => navigate('saved')}><span className="nav-icon"><Bookmark size={19}/></span>간직한 이야기{view === 'saved' && <span className="nav-active-dot"/>}</button>
      </nav>
      <button className="primary-button sidebar-write" onClick={() => write()}><Plus size={18}/> 이야기 쓰기</button>
      <div className="sidebar-pause"><div className="pause-drawing"><Coffee size={30} strokeWidth={1.15}/><span>✧</span></div><p>잠깐의 틈,<br/>마음이 쉬어가는 사이.</p><span>천천히 머물다 가세요.</span></div>
      <div className="sidebar-bottom"><button onClick={() => setInfo('guide')}><ShieldCheck size={16}/> 우리의 약속<ChevronRight size={14}/></button><button onClick={() => setInfo('about')}><HelpCircle size={16}/> 사이에 대하여<ChevronRight size={14}/></button><p>© 2026 sai. A little space for you.</p></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div className="mobile-brand"><button className="brand-link" onClick={() => navigate('all')} aria-label="사이 홈"><Logo small/></button></div><div className="topbar-note"><span className="status-dot"/> 조금 더 솔직해져도 괜찮은 곳</div><div className="topbar-right"><span className="private-label"><ShieldCheck size={14}/> 당신의 익명은 소중하니까</span>{!sessionReady ? <span className="session-loading"/> : user ? <div className="profile-control"><button className="profile-button" onClick={() => setProfileOpen(!profileOpen)} aria-expanded={profileOpen}><span className="profile-avatar"><Moon size={16}/></span>익명의 나<ChevronDown size={14}/></button>{profileOpen && <div className="profile-menu"><p>나만 볼 수 있는 계정 정보</p><span>{user.email}</span><button onClick={logout}><LogOut size={15}/> 로그아웃</button></div>}</div> : <><button className="login-button" onClick={() => requestAuth(null, 'login')}>로그인</button><button className="signup-button" onClick={() => requestAuth(null)}>시작하기<ArrowRight size={14}/></button></>}</div></header>
      <main>
        <section className="hero"><div className="hero-copy"><div className="eyebrow"><span/> 가까운 듯, 편안한 거리</div><h1>이름은 잠시 내려놓고,<br/><span>마음을 나눠요.</span></h1><p>스쳐 가는 생각부터 오래 품어온 이야기까지.<br/>여기서는 있는 그대로의 당신이면 충분해요.</p><button onClick={() => write()}>나의 첫 이야기 남기기 <ArrowUpRightIcon/></button></div><HeroArt/></section>
        <div className="content-columns">
          <section className="feed-section" ref={feed} aria-label={title}>
            <div className="feed-title-row"><h2>{title}<span className="feed-title-dot"/></h2><div className="feed-title-sub">작은 이야기들이 만나는 곳</div></div>
            <div className="feed-toolbar"><div className="category-tabs" role="group" aria-label="주제 필터">{CATEGORIES.map(c => <button className={category === c ? 'active' : ''} key={c} onClick={() => setCategory(c)} aria-pressed={category === c}>{c === '모든 이야기' && <Sparkles size={13}/>} {c}</button>)}</div><label className="sort-select"><span className="sr-only">이야기 정렬</span><select value={sort} onChange={e => setSort(e.target.value)}><option value="latest">최신순</option><option value="popular">공감순</option></select><ChevronDown size={13}/></label></div>
            <div className="search-field"><Search size={17}/><input ref={search} maxLength={200} aria-label="이야기 검색" placeholder="어떤 이야기가 궁금한가요?" value={query} onChange={e => setQuery(e.target.value)}/>{query ? <button className="icon-button" onClick={() => setQuery('')} aria-label="검색어 지우기"><X size={15}/></button> : <kbd>⌘ K</kbd>}</div>
            {view === 'all' && !query && <div className="feed-greeting"><span><Sun size={14}/> 오늘도, 당신의 이야기를 기다려요.</span><span>{loading ? '…' : `${total}개의 이야기`}</span></div>}
            {error ? <div className="empty-state" role="alert"><Wind size={30}/><h3>이야기를 불러오지 못했어요</h3><p>{error}</p><button className="secondary-button" onClick={() => setRefresh(n => n+1)}>다시 불러오기</button></div> : loading ? <div className="post-grid" aria-label="이야기를 불러오는 중" aria-busy="true">{[1,2,3,4].map(n => <div key={n} className="skeleton-card"><span/><div/><div/><div className="short"/><footer/></div>)}</div> : posts.length ? <div className="post-grid">{posts.map(post => <PostCard key={post.id} post={post} onLike={p => interact(p, 'like')} onSave={p => interact(p, 'save')} onComments={setComments} onDelete={deletePost}/>)}</div> : <div className="empty-state"><span className="empty-icon">{view === 'saved' ? <Bookmark size={29} strokeWidth={1.3}/> : <Feather size={29} strokeWidth={1.3}/>}</span><h3>{query ? '아직 닿지 않은 이야기네요' : view === 'saved' ? '오래 간직하고 싶은 이야기를 만나면' : view === 'mine' ? '당신의 첫 이야기를 기다려요' : '첫 번째 이야기가 되어주세요'}</h3><p>{query ? '다른 단어로 마음을 찾아볼까요?' : view === 'saved' ? '이야기 아래의 책갈피를 눌러보세요.' : '작은 생각 하나부터, 편하게 남겨보세요.'}</p><button className="secondary-button" onClick={() => query ? setQuery('') : view === 'saved' ? navigate('all') : write()}>{query ? '모든 이야기 보기' : view === 'saved' ? '이야기 둘러보기' : '이야기 쓰기'}<ArrowRight size={14}/></button></div>}
            {!loading && !error && hasMore && <button className="load-more secondary-button" onClick={loadMore} disabled={loadingMore}>{loadingMore ? <LoaderCircle size={15} className="spin"/> : <Plus size={14}/>} 이야기 더 만나보기</button>}
            {!loading && !error && posts.length > 0 && !hasMore && <div className="feed-end"><span/><Flower2 size={16} strokeWidth={1.2}/><span/><p>서로의 하루에 작은 다정함이 되어주길.</p></div>}
          </section>
          <aside className="right-rail">
            <div className="daily-question"><div className="rail-eyebrow"><span className="question-icon"><Sparkles size={14}/></span> 오늘, 우리 사이</div><h3>오늘 당신을 웃게 한<br/>작은 순간이 있나요?</h3><p>거창하지 않아도 좋아요.<br/>사소한 행복을 나눠주세요.</p><button onClick={() => write('오늘 나를 웃게 한 작은 순간은…')}>내 이야기 들려주기<ArrowRight size={15}/></button><div className="question-flower" aria-hidden="true"><Flower2 size={72} strokeWidth={1}/></div></div>
            <div className="space-note"><div className="space-note-icon"><Users size={19} strokeWidth={1.5}/></div><h3>혼자인 듯, 혼자가 아닌</h3><p>어딘가의 누군가도<br/>당신과 비슷한 마음일 거예요.</p><div className="little-avatars" aria-hidden="true"><span><Moon size={14}/></span><span><Leaf size={14}/></span><span><Sun size={14}/></span><span><Flower2 size={14}/></span><Heart size={13}/></div></div>
            <div className="gentle-reminder"><ShieldCheck size={18} strokeWidth={1.4}/><div><h4>익명 뒤에도, 사람이 있어요.</h4><p>판단 대신 공감을,<br/>충고 대신 따뜻한 한마디를.</p><button onClick={() => setInfo('guide')}>우리의 약속 읽어보기<ChevronRight size={12}/></button></div></div>
            <footer className="rail-footer"><button onClick={() => setInfo('about')}>사이 소개</button><span>·</span><button onClick={() => setInfo('privacy')}>개인정보 안내</button><p>이름 없이 나누는 마음, 사이</p></footer>
          </aside>
        </div>
      </main>
    </div>
    <nav className="mobile-nav" aria-label="모바일 주 메뉴"><button className={view === 'all' ? 'active' : ''} onClick={() => navigate('all')}><Wind size={20}/><span>둘러보기</span></button><button className={view === 'mine' ? 'active' : ''} onClick={() => navigate('mine')}><Feather size={20}/><span>내 이야기</span></button><button className="mobile-write" onClick={() => write()} aria-label="이야기 쓰기"><Plus size={24}/></button><button className={view === 'saved' ? 'active' : ''} onClick={() => navigate('saved')}><Bookmark size={20}/><span>간직한 이야기</span></button><button onClick={() => setInfo('guide')}><ShieldCheck size={20}/><span>우리의 약속</span></button></nav>
    {auth && <AuthModal initialMode={auth} onClose={() => { setAuth(null); pendingAction.current = null; }} onSuccess={signedIn}/>}
    {composer && !auth && <Composer prompt={composer.prompt} onClose={() => setComposer(null)} onPublish={() => { setComposer(null); setView('all'); setCategory('모든 이야기'); setQuery(''); setSort('latest'); setRefresh(n => n+1); toast('당신의 이야기가 사이에 닿았어요.'); window.scrollTo({ top: 320, behavior: 'smooth' }); }}/>}
    {comments && !auth && <Comments post={comments} user={user} onClose={() => setComments(null)} onAuth={() => requestAuth(null, 'login')} onUpdated={id => setPosts(prev => prev.map(p => p.id === id ? { ...p, commentsCount: p.commentsCount + 1 } : p))} toast={toast}/>}
    {info && <Modal title={info === 'guide' ? '우리의 약속' : info === 'privacy' ? '개인정보 안내' : '사이에 대하여'} onClose={() => setInfo(null)} className="info-modal"><span className="info-symbol">{info === 'guide' ? <ShieldCheck size={30} strokeWidth={1.3}/> : info === 'privacy' ? <Bookmark size={30} strokeWidth={1.3}/> : <Sprout size={30} strokeWidth={1.3}/>}</span><h3>{info === 'guide' ? '우리가 지키는 작은 약속' : info === 'privacy' ? '당신의 익명은 소중하니까' : '우리 사이, 편안한 거리'}</h3>{info === 'guide' ? <div className="info-copy"><p>익명이라는 편안함이 누군가에게 상처가 되지 않도록, 함께 지켜주세요.</p><ul><li><Heart size={16}/><span><strong>다정하게 말해요.</strong>다른 생각에도 존중과 공감으로 답해요.</span></li><li><ShieldCheck size={16}/><span><strong>서로의 익명을 지켜요.</strong>실명, 연락처 등 개인정보를 올리지 않아요.</span></li><li><Sprout size={16}/><span><strong>안전한 사이를 만들어요.</strong>혐오·폭력·괴롭힘·광고성 게시물은 남기지 않아요.</span></li></ul></div> : info === 'privacy' ? <div className="info-copy"><p>이메일은 로그인에만 사용되며, 공개 글과 댓글에 표시되지 않아요. 비밀번호는 원문으로 저장하지 않아요.</p><p>로그인 유지를 위해 세션 쿠키를 사용해요. 공개 글에는 익명 이름과 작성 시간이 표시되며, 작성한 글은 계정에 연결되어 직접 삭제할 수 있어요.</p><p>익명은 다른 이용자에게 신원이 공개되지 않는다는 뜻이에요. 이메일·글·댓글 등 계정 관련 데이터는 서버에 저장돼요. 민감한 개인정보는 글에 남기지 말아 주세요.</p></div> : <div className="info-copy"><p>사이는 이름이나 직함보다 마음이 먼저 만나는 공간이에요. 스쳐 가는 생각, 혼자 품었던 고민, 작은 행복까지 편하게 남겨주세요.</p><p>모든 이야기는 누구나 읽을 수 있어요. 회원가입하면 익명으로 글과 댓글을 쓰고, 공감을 보내고, 마음에 닿은 이야기를 저장할 수 있어요.</p><p className="demo-explanation">‘예시 이야기’로 표시된 글은 처음 방문한 분을 위한 가상의 콘텐츠예요. 실제 이용자가 작성한 글과 구분해 표시해요.</p></div>}<button className="primary-button info-confirm" onClick={() => setInfo(null)}>마음에 담아둘게요<Check size={16}/></button></Modal>}
    <div className={`toast ${toastText ? 'visible' : ''}`} role="status" aria-live="polite">{toastText && <><span><Check size={14}/></span>{toastText}</>}</div>
  </div>;
}

function ArrowUpRightIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M6 18 18 6M6 6h12v12"/></svg>; }

export default App;
