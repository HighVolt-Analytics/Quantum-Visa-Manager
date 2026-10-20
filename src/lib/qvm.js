/* Quantum Visa Manager — shared site script */
import { setupBooking } from './bookDemo.js';

(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const I = (n, cls = '') => `<i data-lucide="${n}" class="${cls}" aria-hidden="true"></i>`;
  const icons = () => { if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 1.75 } }); };
  const tickSvg = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.2l2.3 2.3 4.7-5"/></svg>';
  const sparkSvg = '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1.5l1.4 3.9 3.9 1.4-3.9 1.4L8 12.1 6.6 8.2 2.7 6.8l3.9-1.4z"/></svg>';
  const T = (on, extra = '') => `<span class="tick ${on ? 'is-on' : ''} ${extra}">${tickSvg}</span>`;
  window.QVM = { I, icons, T };

  /* ------------------------------------------------------------------ Logo */
  const LOGO = `<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><circle cx="15" cy="15" r="11" stroke="currentColor" stroke-width="2.4"/><path d="M10.4 15.2l3.3 3.3 8.6-8.6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M22.6 22.6l5 5" stroke="var(--accent)" stroke-width="2.6" stroke-linecap="round"/></svg>`;

  /* ------------------------------------------------------------ Navigation */
  const NAV = [
    { t: 'Platform', h: 'platform.html', key: 'platform', sub: [
      ['Visa Operations', 'visa-operations.html', 'Documents, checklists, forms and timelines'],
      ['Correspondence & Tasks', 'platform.html#correspondence', 'Department and client email to action'],
      ['Document & Checklist Automation', 'platform.html#documents', 'Check, file and update automatically'],
      ['Form Preparation', 'platform.html#forms', 'Mapping and browser-assisted prefill'],
      ['AI Control & Security', 'ai-control-security.html', 'Your rules, audit trail and data residency'],
    ] },
    { t: 'Solutions', h: 'solutions.html', key: 'solutions', sub: [
      ['Migration Practices', 'solutions.html#practices', 'For registered migration agents and teams'],
      ['Corporate Sponsorship Teams', 'corporate-sponsorship.html', 'Sponsor records, nominees and renewals'],
      ['Practice Growth', 'practice-growth.html', 'Enquiries, CRM and after-hours reception'],
      ['Skills Assessment', 'solutions.html#skills', 'ANZSCO and assessment steps', 'soon'],
    ] },
    { t: 'How It Works', h: 'how-it-works.html', key: 'how' },
    { t: 'Pricing', h: 'pricing.html', key: 'pricing' },
    { t: 'Resources', h: 'resources.html', key: 'resources' },
  ];

  function header() {
    const page = document.body.dataset.page || '';
    const links = NAV.map(n => {
      const cur = n.key === page ? ' aria-current="page"' : '';
      if (!n.sub) return `<div class="nav-item"><a class="nav-link" href="${n.h}"${cur}>${n.t}</a></div>`;
      return `<div class="nav-item"><a class="nav-link" href="${n.h}"${cur}>${n.t}<svg viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 1l4 4 4-4"/></svg></a>
        <div class="menu" role="menu">${n.sub.map(s => `<a role="menuitem" href="${s[1]}"><b>${s[0]}${s[3] ? ' <span class="badge badge--soon">Coming soon</span>' : ''}</b><span>${s[2]}</span></a>`).join('')}</div></div>`;
    }).join('');
    const mobile = NAV.map(n => `<div class="m-group"><a class="m-title" href="${n.h}">${n.t}</a>${n.sub ? `<div class="m-sub">${n.sub.map(s => `<a href="${s[1]}">${s[0]}${s[3] ? ' · Coming soon' : ''}</a>`).join('')}</div>` : ''}</div>`).join('');
    const el = document.createElement('div');
    el.innerHTML = `<a class="skip" href="#main">Skip to content</a>
    <header class="site-header" id="top"><div class="wrap nav">
      <a class="brand" href="index.html" aria-label="Quantum Visa Manager home">${LOGO}<span>Quantum <span class="brand-sub">Visa Manager</span></span></a>
      <nav class="nav-links" aria-label="Primary">${links}</nav>
      <div class="nav-actions">
        <button class="icon-btn" data-theme-toggle aria-label="Switch to dark mode"><i data-lucide="moon"></i></button>
        <a class="btn btn--primary btn--sm" href="book-demo.html">Book a Demo</a>
        <button class="icon-btn menu-toggle" aria-label="Open menu" aria-expanded="false" aria-controls="mnav"><i data-lucide="menu"></i></button>
      </div>
    </div></header>
    <div class="mobile-nav" id="mnav" aria-label="Mobile">${mobile}<div class="m-group" style="border:0"><a class="btn btn--primary btn--lg" style="width:100%" href="book-demo.html">Book a Demo</a></div></div>`;
    document.body.prepend(...el.childNodes);
  }

  function footer() {
    const col = (t, items) => `<div class="f-col"><h4>${t}</h4><ul>${items.map(i => `<li><a href="${i[1]}">${i[0]}</a></li>`).join('')}</ul></div>`;
    const f = document.createElement('footer');
    f.className = 'site-footer';
    f.innerHTML = `<div class="wrap">
      <div class="f-top">
        <div class="f-brand"><a class="brand" href="index.html">${LOGO}<span>Quantum <span class="brand-sub">Visa Manager</span></span></a>
          <p>Software that completes the administrative work behind every visa matter — while registered migration agents stay responsible for advice, review and lodgement.</p>
          <a class="status-dot" href="support.html#status">All systems operational</a></div>
        ${col('Platform', [['Visa Operations', 'visa-operations.html'], ['Correspondence & Tasks', 'platform.html#correspondence'], ['Document & Checklist', 'platform.html#documents'], ['Form Preparation', 'platform.html#forms'], ['Visa Library', 'platform.html#library'], ['AI Control', 'ai-control-security.html']])}
        ${col('Solutions', [['Migration Practices', 'solutions.html#practices'], ['Corporate Sponsorship', 'corporate-sponsorship.html'], ['Practice Growth', 'practice-growth.html'], ['Skills Assessment — soon', 'solutions.html#skills'], ['Interactive Tour', 'how-it-works.html#tour']])}
        ${col('Company', [['About', 'resources.html#about'], ['Product updates', 'resources.html#updates'], ['Guides', 'resources.html#guides'], ['Pricing', 'pricing.html'], ['Contact', 'support.html#contact'], ['Book a Demo', 'book-demo.html']])}
        ${col('Support & Legal', [['Support', 'support.html'], ['Product status', 'support.html#status'], ['Security', 'ai-control-security.html#security'], ['Data residency', 'ai-control-security.html#residency'], ['Privacy', 'privacy.html'], ['Terms', 'terms.html']])}
      </div>
      <div class="f-ack">
        <p>We acknowledge the Traditional Custodians of the lands on which we work and live, and pay our respects to Elders past and present. Sovereignty was never ceded.</p>
        <p>Quantum Visa Manager is practice-administration software. It does not provide immigration assistance or legal advice. Immigration assistance in Australia must be given by a registered migration agent or a person otherwise permitted to do so under the <i>Migration Act 1958</i>. Calculators and timelines are estimates, not guarantees of outcomes or processing times.</p>
      </div>
      <div class="f-bottom"><span>© 2026 High Volt Analytics. Made in Sydney, Australia. Prices in AUD.</span>
        <nav aria-label="Legal"><a href="privacy.html">Privacy</a><a href="terms.html">Terms</a><a href="ai-control-security.html#security">Security</a><a href="ai-control-security.html#residency">Data residency</a><a href="support.html">Support</a></nav></div>
    </div>`;
    document.body.appendChild(f);
  }

  /* --------------------------------------------------------------- Theme */
  function theme() {
    const root = document.documentElement;
    let t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    const btn = $('[data-theme-toggle]');
    const set = v => { t = v; root.setAttribute('data-theme', v); btn.innerHTML = `<i data-lucide="${v === 'dark' ? 'sun' : 'moon'}"></i>`; btn.setAttribute('aria-label', `Switch to ${v === 'dark' ? 'light' : 'dark'} mode`); icons(); };
    set(t);
    btn.addEventListener('click', () => set(t === 'dark' ? 'light' : 'dark'));
  }

  function chrome() {
    const h = $('.site-header');
    const onS = () => h.classList.toggle('is-scrolled', scrollY > 8);
    addEventListener('scroll', onS, { passive: true }); onS();
    const tg = $('.menu-toggle'), mn = $('#mnav');
    tg.addEventListener('click', () => {
      const open = !mn.classList.contains('is-open');
      mn.classList.toggle('is-open', open); document.body.classList.toggle('nav-open', open);
      tg.setAttribute('aria-expanded', open); tg.innerHTML = `<i data-lucide="${open ? 'x' : 'menu'}"></i>`; icons();
    });
    $$('#mnav a').forEach(a => a.addEventListener('click', () => { mn.classList.remove('is-open'); document.body.classList.remove('nav-open'); }));
  }

  /* -------------------------------------------------------- Scene helpers */
  const S = {
    mail: (from, role, subj, body, files = []) => `<div class="ui-card"><div class="mail-head"><span class="avatar">${from.split(' ').map(w => w[0]).join('').slice(0, 2)}</span><div><b>${from}</b><small>${role}</small></div><span class="tag" style="margin-left:auto">Inbox</span></div>
      <div style="margin-top:10px"><div class="ui-title" style="font-size:13px">${subj}</div><p class="ui-sub" style="margin-top:4px;line-height:1.5">${body}</p></div>
      ${files.map(f => `<div class="attach" style="margin-top:8px"><span class="ui-file">PDF</span><div><b>${f[0]}</b><small>${f[1]}</small></div></div>`).join('')}</div>`,
    checks: (title, rows) => `<div class="ui-card"><div class="ui-label">${title}</div><div style="margin-top:8px">${rows.map(r => `<div class="ui-row">${r[2] === 'warn' ? T(false, 'is-warn') : T(r[2] !== false)}<div class="grow"><b>${r[0]}</b><small>${r[1]}</small></div></div>`).join('')}</div></div>`,
    list: (title, sub, rows, foot = '') => `<div class="ui-card"><div class="flex between items-center"><div><div class="ui-title">${title}</div><div class="ui-sub">${sub}</div></div></div><div style="margin-top:6px">${rows.map(r => `<div class="ui-row">${r[2] === 'warn' ? T(false, 'is-warn') : T(!!r[2])}<div class="grow"><b>${r[0]}</b><small>${r[1]}</small></div>${r[3] ? `<span class="tag ${r[4] || ''}">${r[3]}</span>` : ''}</div>`).join('')}</div>${foot}</div>`,
    task: (title, rows, owner, due, draft) => `<div class="ui-card"><div class="flex between items-center"><span class="tag tag--ai">${sparkSvg.replace('<svg', '<svg width="10" height="10" style="margin-right:4px"')}Task created</span><span class="ui-sub">${due}</span></div>
      <div class="ui-title" style="margin-top:10px">${title}</div>
      <dl class="kv" style="margin-top:10px">${rows.map(r => `<dt>${r[0]}</dt><dd>${r[1]}</dd>`).join('')}<dt>Assigned to</dt><dd>${owner}</dd></dl>
      ${draft ? `<div class="ui-card ui-card--soft" style="margin-top:12px;padding:10px 12px"><div class="ui-label">Draft response</div><p class="ui-sub" style="margin-top:4px;line-height:1.5">${draft}</p></div>` : ''}</div>`,
    form: (title, fields) => `<div class="ui-card"><div class="flex between items-center"><div class="ui-title">${title}</div><span class="tag">Prefill</span></div><div style="margin-top:10px;display:grid;gap:8px">${fields.map(f => `<div style="display:grid;gap:3px"><span class="ui-sub" style="font-size:11px">${f[0]}</span><div style="height:30px;border-radius:7px;display:flex;align-items:center;justify-content:space-between;padding:0 10px;font-size:12px;box-shadow:inset 0 0 0 1px ${f[2] ? 'var(--accent)' : 'var(--line-2)'};background:${f[2] ? 'var(--accent-soft)' : 'var(--surface)'}"><span>${f[1]}</span>${f[2] ? '<span style="font-size:10px;color:var(--accent-ink)">from verified document</span>' : ''}</div></div>`).join('')}</div></div>`,
    review: (title, sub, btn = 'Review & approve') => `<div class="ui-card" style="background:var(--ink);color:var(--bg);box-shadow:var(--shadow-lg)"><div class="ui-label" style="color:inherit;opacity:.6">Consultant checkpoint</div><div class="ui-title" style="margin-top:8px;font-size:15px">${title}</div><p style="font-size:12px;opacity:.7;margin-top:4px;line-height:1.5">${sub}</p><div class="flex gap-2" style="margin-top:14px"><span class="ui-btn" style="background:var(--bg);color:var(--ink)">${btn}</span><span class="ui-btn" style="background:transparent;color:inherit;box-shadow:inset 0 0 0 1px rgba(127,127,127,.4)">Return with note</span></div></div>`,
    call: (lines) => `<div class="ui-card"><div class="call-head"><span class="live"></span><div><div class="ui-title" style="font-size:13px">Incoming call · +61 2 •••• 4410</div><div class="ui-sub">AI receptionist · 9:42 pm AEDT</div></div></div><div style="display:grid;gap:8px;margin-top:12px">${lines.map(l => `<div class="bubble bubble--${l[0]}">${l[1]}${l[2] ? `<small>${l[2]}</small>` : ''}</div>`).join('')}</div></div>`,
  };
  window.QVM.S = S;

  /* ------------------------------------------------------------ Clip player */
  function Clip(el, cfg) {
    const per = cfg.per || 5000;
    const n = cfg.scenes.length, total = n * per;
    el.classList.add('clip');
    el.innerHTML = `${cfg.title ? `<div class="clip-meta"><b>${cfg.title}</b><span class="xs muted mono">${Math.round(total / 1000)} s · captioned</span></div>` : ''}
      <div style="padding:${cfg.title ? '14px 14px 0' : '0'}"><div class="clip-screen" style="border-radius:${cfg.title ? '14px' : '0'}" role="img" aria-label="${cfg.title || 'Product workflow demonstration'}">
        ${cfg.scenes.map((s, i) => `<div class="clip-scene${i === 0 ? ' is-on' : ''}">${s.html}</div>`).join('')}
        <span class="signoff">${tickSvg.replace('<svg', '<svg width="12" height="12"')}Consultant sign-off</span>
        <div class="clip-cc" aria-live="polite">${cfg.scenes[0].cc}</div></div></div>
      <div class="clip-ctrl"><button class="pp" aria-label="Pause">${I('pause')}</button><button class="rs" aria-label="Restart">${I('rotate-ccw')}</button>
        <div class="clip-track">${cfg.scenes.map(() => '<i><b></b></i>').join('')}</div><span class="clip-time">0:00</span>
        <button class="cc-btn" aria-pressed="true" aria-label="Captions">CC</button></div>`;
    const scenes = $$('.clip-scene', el), bars = $$('.clip-track b', el), cc = $('.clip-cc', el), so = $('.signoff', el), time = $('.clip-time', el), pp = $('.pp', el);
    let t = 0, playing = !reduce && cfg.autoplay !== false, last = 0, raf, cur = -1, visible = false;
    const show = i => { if (i === cur) return; cur = i; cfg.onScene && cfg.onScene(i); scenes.forEach((s, k) => s.classList.toggle('is-on', k === i)); cc.textContent = cfg.scenes[i].cc; so.classList.toggle('is-on', !!cfg.scenes[i].signoff); };
    const mmss = x => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, '0')}`;
    const draw = () => { const i = Math.min(n - 1, Math.floor(t / per)); show(i); bars.forEach((b, k) => b.style.width = (k < i ? 100 : k === i ? ((t - i * per) / per) * 100 : 0) + '%'); time.textContent = `${mmss(t / 1000)} / ${mmss(total / 1000)}`; };
    const loop = ts => { if (!last) last = ts; if (playing && visible) { t += ts - last; if (t >= total) t = 0; draw(); } last = ts; raf = requestAnimationFrame(loop); };
    const setP = p => { playing = p; pp.innerHTML = I(p ? 'pause' : 'play'); pp.setAttribute('aria-label', p ? 'Pause' : 'Play'); icons(); };
    pp.addEventListener('click', () => setP(!playing));
    $('.rs', el).addEventListener('click', () => { t = 0; draw(); setP(true); });
    $('.cc-btn', el).addEventListener('click', e => { const on = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', on); el.classList.toggle('cc-off', !on); });
    $$('.clip-track i', el).forEach((b, k) => { b.style.cursor = 'pointer'; b.addEventListener('click', () => { t = k * per + 1; draw(); }); });
    const io = new IntersectionObserver(es => es.forEach(e => visible = e.isIntersecting), { threshold: 0.25 }); io.observe(el);
    if (reduce) { t = (n - 1) * per; draw(); setP(false); } else { draw(); setP(playing); }
    raf = requestAnimationFrame(loop);
    icons();
    return { destroy: () => { cancelAnimationFrame(raf); io.disconnect(); }, seek: i => { t = i * per + 1; draw(); setP(true); } };
  }
  window.QVM.Clip = Clip;

  /* ----------------------------------------------------------- Clip library */
  const CLIPS = {
    docs: { title: 'Document to checklist', scenes: [
      { cc: 'A client replies with two attachments. Quantum detects the documents in the connected inbox.', html: S.mail('A. N•••••', 'Client · Matter VM-2041 · Subclass 190', 'Re: Documents for your application', 'Hi, attaching my passport and police certificate as requested.', [['passport_scan.pdf', '2 pages · 1.2 MB'], ['police_cert.pdf', '1 page · 640 KB']]) },
      { cc: 'Each document is identified and checked against the requirements in your visa library.', html: S.checks('Checking · passport_scan.pdf', [['Identified: passport bio page', 'Document type matched'], ['Name and date of birth match matter record', 'Compared with client profile'], ['Valid until 03/2031', 'Beyond the planned lodgement window'], ['Legible, colour, all corners visible', 'Quality check']]) },
      { cc: 'Files are renamed to your convention and stored in the right matter folder.', html: S.list('Filed to matter', 'VM-2041 › Identity and character', [['Passport_AN_bio_14-10-2026.pdf', 'Identity', true, 'Filed'], ['PoliceCert_IN_AN_11-09-2026.pdf', 'Character', true, 'Filed']]) },
      { cc: 'The checklist updates itself. Outstanding items get a scheduled, polite reminder.', html: S.list('Checklist · Subclass 190', '7 of 9 received', [['Passport bio page', 'Received today', true], ['Police certificate — India', 'Received today', true], ['Skills assessment outcome', 'Received 02/10/2026', true], ['English test result', 'Reminder scheduled 16/10', 'warn', 'Chasing', 'tag--warn']]) },
      { cc: 'Nothing is accepted until you review it. Approve, or return it with a note.', signoff: true, html: S.review('2 documents ready for review', 'Matter VM-2041 · AI checks passed · 0 exceptions') },
    ] },
    expiry: { title: 'Expiry and requirement checks', scenes: [
      { cc: 'A new document arrives for a partner visa matter.', html: S.mail('R. P•••••', 'Client · Matter VM-1987 · Subclass 820/801', 'Updated documents', 'Please find my police certificate attached.', [['afp_check.pdf', '1 page · 410 KB']]) },
      { cc: 'Quantum compares issue dates with the validity window set in your visa library.', html: S.checks('Checking · afp_check.pdf', [['Identified: Australian police check', 'Document type matched'], ['Issued 02/02/2026', 'Compared to your configured validity window'], ['Outside the configured window', 'Flagged for a replacement', 'warn']]) },
      { cc: 'An exception is raised instead of silently filing an unsuitable document.', html: S.list('Exceptions', 'VM-1987', [['Police check may need replacing', 'Validity window exceeded', 'warn', 'Exception', 'tag--warn'], ['Relationship evidence', 'Complete', true]]) },
      { cc: 'You decide: accept with a note, or send the drafted replacement request.', signoff: true, html: S.review('1 exception needs your decision', 'Draft request to client is ready', 'Send request') },
    ] },
    forms: { title: 'Document to form', scenes: [
      { cc: 'Once you accept a document, its verified details become available to forms.', html: S.list('Accepted documents', 'VM-2041', [['Passport bio page', 'Accepted by S. Mehta', true], ['Birth certificate', 'Accepted by S. Mehta', true], ['Skills assessment outcome', 'Accepted by S. Mehta', true]]) },
      { cc: 'Quantum maps the verified data into the applicable forms for this visa stream.', html: S.form('Applicant details', [['Family name', 'N•••••', true], ['Given names', 'A•••', true], ['Date of birth', '••/••/1993', true], ['Passport number', 'P•••••42', true]]) },
      { cc: 'In the government website, the browser extension prefills matching fields.', html: S.form('Browser extension · ImmiAccount', [['Country of passport', 'India', true], ['Passport expiry', '••/03/2031', true], ['Residential address', 'Requires consultant input', false]]) },
      { cc: 'You check and verify every entry. Submission and lodgement remain with you.', signoff: true, html: S.review('Prefill complete · 38 fields', '1 field needs your input · nothing submitted', 'Review fields') },
    ] },
    corr: { title: 'Department correspondence to task', scenes: [
      { cc: 'An email arrives from the Department on a lodged matter.', html: S.mail('Department of Home Affairs', 'Correspondence · Matter VM-1874 · Subclass 482', 'Request for additional information', 'We require further information to continue assessing this application. Please provide the requested documents within the timeframe specified in the attached letter.', [['request_letter.pdf', '2 pages']]) },
      { cc: 'Quantum reads the request in the email chain and identifies what is being asked.', html: S.checks('Understanding request', [['Request type: additional information', 'From letter and email chain'], ['Items requested: 2', 'Updated employment reference · health declaration'], ['Proposed response date: 04/11/2026', 'For practitioner verification', 'warn']]) },
      { cc: 'A task is created, assigned to the responsible person and a response is drafted.', html: S.task('Respond to request for additional information', [['Matter', 'VM-1874'], ['Proposed due', '04/11/2026']], 'J. Walker (RMA)', 'Created 9:04 am', 'Dear client, the Department has asked for two items to continue assessing your application…') },
      { cc: 'You verify the legal deadline. Only the verified date governs the task.', signoff: true, html: S.review('Verify deadline and approve draft', 'AI-proposed date shown for comparison only', 'Verify deadline') },
    ] },
    library: { title: 'Visa library update', scenes: [
      { cc: 'Quantum monitors government publications for changes to rules, forms, fees and timelines.', html: S.list('Monitored sources', 'Last checked 6:00 am AEDT', [['Visa pages and forms', 'No change', true], ['Fees and charges', 'Change detected', 'warn', 'Change', 'tag--warn'], ['Processing benchmarks', 'Updated monthly', true]]) },
      { cc: 'It identifies which templates, checklists and estimators the change affects.', html: S.checks('Impact assessment', [['Fee estimator · 3 visa streams', 'Reference value change'], ['Client cost estimates · 6 open drafts', 'Would be recalculated'], ['Lodged matters', 'Not changed — historical values kept']]) },
      { cc: 'A change proposal is prepared with the source link and a before-and-after view.', html: S.list('Change proposal #148', 'Source linked · effective date noted', [['Before', 'Previous reference value', false, 'Current'], ['After', 'Published reference value', true, 'Proposed', 'tag--ai']]) },
      { cc: 'Nothing changes until an authorised consultant approves it.', signoff: true, html: S.review('Approve library update #148', 'Applies to 3 streams · 6 draft estimates', 'Approve update') },
    ] },
    reception: { title: 'After-hours enquiry', scenes: [
      { cc: 'A prospect calls your local number after hours. The AI receptionist answers in their language.', html: S.call([['caller', '你好，我想咨询一下雇主担保签证。', 'Caller · Mandarin'], ['ai', '您好！我可以先记录您的情况，并为您预约注册移民代理的咨询。', 'AI receptionist · Mandarin']]) },
      { cc: 'It answers general service questions only and gathers the details your consultants need.', html: S.checks('Captured · translated to English', [['Interested in employer sponsorship', 'Currently in Australia on a student visa'], ['Has a potential employer in Melbourne', 'Occupation: data analyst'], ['No advice given', 'Consultation offered instead']]) },
      { cc: 'The enquiry is qualified, routed and booked into a consultant\u2019s calendar.', html: S.task('New qualified lead', [['Source', 'Phone · AU local number'], ['Language', 'Mandarin'], ['Consultation', 'Thu 16/10 · 10:30 am']], 'L. Chen (RMA)', 'Logged 9:44 pm') },
      { cc: 'Your consultant picks it up in the morning with the full summary.', signoff: true, html: S.review('Review lead before consultation', 'Summary, transcript and booking attached', 'Open lead') },
    ] },
    sponsor: { title: 'Sponsor document reuse', scenes: [
      { cc: 'A new nomination is started for an existing corporate sponsor.', html: S.list('New nomination', 'Sponsor: H•••• Engineering Pty Ltd', [['Standard business sponsorship', 'Approved · on file', true], ['Nominee', 'K. S••••• · Civil engineer', true]]) },
      { cc: 'Quantum links the nomination to the sponsor\u2019s reusable document pack.', html: S.list('Sponsor document pack', '34 records · 31 current', [['ASIC company extract', 'Current', true], ['Financial statements FY26', 'Current', true], ['Organisation chart', 'Expires 30/11/2026', 'warn', 'Expiring', 'tag--warn']]) },
      { cc: 'Expiring items are flagged and a request to the HR contact is drafted.', html: S.task('Request updated organisation chart', [['Sponsor', 'H•••• Engineering'], ['Linked matters', '3 nominations']], 'HR contact · M. B•••', 'Drafted 11:20 am') },
      { cc: 'You confirm which documents are reused for this nomination.', signoff: true, html: S.review('Confirm reused documents', '31 reused · 1 requested · 2 not applicable', 'Confirm pack') },
    ] },
  };
  window.QVM.CLIPS = CLIPS;

  /* -------------------------------------------------------------- Hero flow */
  function heroFlow(el) {
    const steps = [
      'An email from a client arrives with two attachments.',
      'Quantum identifies each document and checks it against the visa requirements.',
      'Files are renamed and stored in the right matter folder.',
      'The Subclass 190 checklist updates. The missing item gets a reminder.',
      'Two documents wait for your review. Nothing is accepted without you.',
    ];
    el.innerHTML = `<div class="win-bar"><div class="win-dots"><i></i><i></i><i></i></div><div class="win-title">${LOGO.replace('<svg', '<svg width="13" height="13"')}Matter VM-2041 · Skilled Nominated (Subclass 190)</div><span class="tag" style="font-size:10.5px">Live workflow</span></div>
      <div class="flow">
        <div class="flow-col"><div class="ui-label"><span class="step-n">1</span>Incoming</div>
          <div class="mail" data-f="mail"><div class="mail-head"><span class="avatar">AN</span><div><b>A. N•••••</b><small>Client · 9:02 am</small></div></div>
          <p>Hi, attaching my passport and police certificate as requested. Thanks!</p>
          <div class="attach"><span class="ui-file">PDF</span><div><b>passport_scan.pdf</b><small>2 pages · 1.2 MB</small></div></div>
          <div class="attach"><span class="ui-file">PDF</span><div><b>police_cert.pdf</b><small>1 page · 640 KB</small></div></div></div>
          <div class="ui-card ui-card--soft" data-f="filed" style="opacity:.35;transition:opacity .6s">
            <div class="ui-label">Filed to</div><div style="font-size:12px;margin-top:6px;font-family:var(--mono);line-height:1.6;color:var(--ink-2)">VM-2041/Identity/<br><b style="font-weight:500;color:var(--ink)">Passport_AN_bio.pdf</b><br>VM-2041/Character/<br><b style="font-weight:500;color:var(--ink)">PoliceCert_IN_AN.pdf</b></div></div>
        </div>
        <div class="flow-col"><div class="ui-label"><span class="step-n">2</span>AI checks</div>
          <div class="checks">
            ${[['Document type identified', 'Passport bio page · Police certificate'], ['Details match the matter', 'Name and date of birth'], ['Expiry and validity', 'Passport valid to 03/2031'], ['Issue date in window', 'Police certificate · 11/09/2026'], ['Quality', 'Legible, colour, complete']].map(c => `<div class="check" data-f="check"><span class="spinner"></span><div class="grow">${c[0]}<small>${c[1]}</small></div></div>`).join('')}
          </div></div>
        <div class="flow-col"><div class="ui-label"><span class="step-n">3</span>Checklist · Subclass 190</div>
          <div class="list-card">
            ${[['Passport bio page', 'Identity', 1], ['Police certificate — India', 'Character', 1], ['Skills assessment outcome', 'Received 02/10/2026', 0, true], ['Birth certificate', 'Received 30/09/2026', 0, true], ['English test result', 'Requested', 2]].map(r => `<div class="ui-row" data-f="item" data-k="${r[2]}">${T(!!r[3])}<div class="grow"><b>${r[0]}</b><small>${r[1]}</small></div></div>`).join('')}
          </div>
          <div class="review-cta" data-f="review"><div class="grow"><b style="font-weight:500">2 documents ready for review</b><small>AI checks passed · 0 exceptions</small></div><span class="ui-btn">Review</span></div>
        </div>
      </div>
      <div class="flow-caption"><div class="fcap" aria-live="polite"><span class="step-n mono" data-f="n" style="color:var(--accent)">01</span><span data-f="cap">${steps[0]}</span></div><button class="play-toggle" data-f="pp" aria-label="Pause animation">${I('pause')}<span>Pause</span></button></div>`;
    const q = k => $$(`[data-f="${k}"]`, el);
    const mail = q('mail')[0], filed = q('filed')[0], checks = q('check'), items = q('item'), review = q('review')[0], cap = q('cap')[0], num = q('n')[0], pp = q('pp')[0];
    let step = -1, timer, playing = !reduce;
    const reset = () => { mail.classList.remove('is-in'); filed.style.opacity = .35; checks.forEach(c => { c.classList.remove('is-done'); c.firstElementChild.outerHTML = '<span class="spinner"></span>'; }); items.forEach(r => { const k = r.dataset.k; const t = r.firstElementChild; if (k === '1') t.className = 'tick'; if (k === '2') { t.className = 'tick'; r.querySelector('small').textContent = 'Requested'; } }); review.classList.remove('is-in'); };
    const go = s => {
      step = s; cap.textContent = steps[s]; num.textContent = '0' + (s + 1);
      if (s === 0) { reset(); requestAnimationFrame(() => mail.classList.add('is-in')); }
      if (s === 1) checks.forEach((c, i) => setTimeout(() => { c.classList.add('is-done'); c.firstElementChild.outerHTML = T(true); }, reduce ? 0 : 300 + i * 380));
      if (s === 2) filed.style.opacity = 1;
      if (s === 3) items.forEach((r, i) => { const k = r.dataset.k; setTimeout(() => { if (k === '1') { r.firstElementChild.className = 'tick is-on'; r.classList.remove('is-flash'); void r.offsetWidth; r.classList.add('is-flash'); } if (k === '2') { r.firstElementChild.className = 'tick is-warn'; r.querySelector('small').textContent = 'Reminder scheduled · 16/10'; } }, reduce ? 0 : i * 260); });
      if (s === 4) review.classList.add('is-in');
    };
    const next = () => { go((step + 1) % steps.length); if (playing) timer = setTimeout(next, step === 4 ? 4200 : 3000); };
    pp.addEventListener('click', () => { playing = !playing; pp.innerHTML = `${I(playing ? 'pause' : 'play')}<span>${playing ? 'Pause' : 'Play'}</span>`; pp.setAttribute('aria-label', playing ? 'Pause animation' : 'Play animation'); icons(); clearTimeout(timer); if (playing) next(); });
    if (reduce) { for (let i = 0; i < 5; i++) go(i); pp.innerHTML = `${I('play')}<span>Play</span>`; playing = false; }
    else { const io = new IntersectionObserver(es => { if (es[0].isIntersecting && step === -1) next(); }, { threshold: .3 }); io.observe(el); }
    icons();
  }

  /* ---------------------------------------------------------------- Problems */
  const PROBLEMS = [
    { t: 'Chasing missing documents', clip: 'docs',
      manual: ['Compare the checklist with what has arrived', 'Write a reminder for each client', 'Watch the inbox for replies', 'Chase again when nothing arrives'],
      q: 'Identifies outstanding items for each visa stream, sends requests in your tone and schedules follow-up reminders until the document arrives.',
      you: 'You approve request templates and reminder timing once. You can pause chasing on any matter.' },
    { t: 'Checking expiry and eligibility', clip: 'expiry',
      manual: ['Open each file', 'Check issue and expiry dates', 'Confirm it is the right document', 'Note any issues for the client'],
      q: 'Checks document type, details, expiry and validity against the requirement set in your visa library. Unsuitable documents become exceptions, not files.',
      you: 'Every document waits for your acceptance. You decide on each exception.' },
    { t: 'Re-entering data into forms', clip: 'forms',
      manual: ['Find the verified document', 'Copy each detail into a PDF form', 'Re-type the same data online', 'Re-check for typing errors'],
      q: 'Maps verified details to the applicable forms and prefills matching government web-form fields through a browser extension.',
      you: 'You check and verify each entry. Submission and lodgement are always your actions.' },
    { t: 'Managing Department and client correspondence', clip: 'corr',
      manual: ['Read every email on every matter', 'Work out what is being asked', 'Create a task and choose an owner', 'Draft the reply from scratch'],
      q: 'Reads authorised inbound email, understands the request in the chain, creates the task, assigns the responsible person and drafts a response.',
      you: 'You verify legal deadlines and approve what is sent. Proposed dates never govern on their own.' },
    { t: 'Keeping up with changing requirements', clip: 'library',
      manual: ['Watch government pages', 'Work out which checklists are affected', 'Update templates by hand', 'Tell the team what changed'],
      q: 'Monitors government publications, identifies the effect on checklists, templates, fees and timelines, and prepares a change proposal.',
      you: 'Nothing changes until an authorised consultant approves the update.' },
    { t: 'Missing enquiries after hours', clip: 'reception',
      manual: ['Voicemail fills overnight', 'Call back across time zones', 'Prospects choose whoever answers first', 'Details are lost between notes'],
      q: 'A multilingual AI receptionist on local numbers answers general service questions, qualifies the enquiry and books a consultation.',
      you: 'The receptionist never gives immigration advice. Your consultant takes over from the first consultation.' },
  ];

  function problems(el) {
    el.innerHTML = `<div class="p-list" role="tablist" aria-orientation="vertical">${PROBLEMS.map((p, i) => `<div class="p-item"><button class="p-btn" role="tab" id="pt${i}" aria-controls="pdetail" aria-selected="false"><span class="n">0${i + 1}</span><span class="t">${p.t}</span><span class="chev"><svg viewBox="0 0 6 10" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M1 1l4 4-4 4"/></svg></span></button><div class="p-inline"></div></div>`).join('')}</div><div class="p-stage"></div>`;
    const detail = document.createElement('div'); detail.id = 'pdetail'; detail.setAttribute('role', 'tabpanel');
    const stage = $('.p-stage', el); let clip, cur = -1;
    const mq = matchMedia('(min-width: 980px)');
    const place = () => { (mq.matches ? stage : $$('.p-inline', el)[cur]).appendChild(detail); };
    const select = (i, focus) => {
      if (i === cur && !mq.matches) { $$('.p-item', el)[i].classList.toggle('is-active'); return; }
      cur = i; const p = PROBLEMS[i];
      $$('.p-item', el).forEach((it, k) => { it.classList.toggle('is-active', k === i); it.querySelector('.p-btn').setAttribute('aria-selected', k === i); });
      detail.setAttribute('aria-labelledby', 'pt' + i);
      detail.innerHTML = `<div class="p-detail"><div class="cdiv"></div><div class="p-cols">
        <div class="p-col"><h4><span class="dot" style="color:var(--faint)"></span>Without Quantum</h4><ol>${p.manual.map(m => `<li>${m}</li>`).join('')}</ol></div>
        <div class="p-col p-col--quantum"><h4><span class="dot"></span>What Quantum does</h4><p>${p.q}</p></div>
        <div class="p-col p-col--you"><h4><span class="dot"></span>Your checkpoint</h4><p>${p.you}</p></div></div></div>`;
      if (clip) clip.destroy();
      clip = Clip($('.cdiv', detail), CLIPS[p.clip]);
      place();
      if (focus) $$('.p-btn', el)[i].focus();
    };
    $$('.p-btn', el).forEach((b, i) => { b.addEventListener('click', () => select(i)); b.addEventListener('keydown', e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); select((i + (e.key === 'ArrowDown' ? 1 : 5)) % 6, true); } }); });
    mq.addEventListener('change', place);
    select(0);
  }

  /* -------------------------------------------------------------- Difference */
  function difference(el) {
    const btn = $('[data-diff-play]', el); const old = $$('.diff-col--old .diff-step', el), neu = $$('.diff-col--new .diff-step', el);
    const run = () => {
      [...old, ...neu].forEach(s => s.classList.remove('is-lit'));
      old.forEach((s, i) => setTimeout(() => s.classList.add('is-lit'), reduce ? 0 : i * 520));
      neu.forEach((s, i) => setTimeout(() => s.classList.add('is-lit'), reduce ? 0 : i * 520));
    };
    btn && btn.addEventListener('click', run);
    const io = new IntersectionObserver(es => { if (es[0].isIntersecting) { run(); io.disconnect(); } }, { threshold: .35 }); io.observe(el);
  }

  /* ----------------------------------------------------------------- Journey */
  const JOURNEY = [
    ['Enquiry', 'A prospect fills in your website form, messages on social media or calls a local number.', 'Captures the details, answers general service questions in their language and logs the lead in your CRM.', 'A consultant sees the new lead with source, language and summary.', 'New lead'],
    ['Qualification', 'A new lead is captured.', 'Asks your structured pre-qualification questions, scores fit, routes to the right consultant and books an initial consultation.', 'The consultant holds the initial consultation and decides whether to take on the matter.', 'Qualified · consultation booked'],
    ['Engagement & Payment', 'The consultant confirms the services to be provided.', 'Drafts the service agreement from your templates with fees, disbursements and refund policy, records that the Consumer Guide was provided, and prepares the invoice and payment link.', 'You approve the agreement and fees before anything is sent to the client.', 'Engaged · agreement signed'],
    ['Onboarding', 'The service agreement is signed and payment is received.', 'Opens the matter, generates the checklist for the visa stream and the client\u2019s circumstances, invites the client to the portal and plans tasks against your internal SLAs.', 'You approve the matter plan, owners and indicative timeline.', 'Matter open'],
    ['Document Collection', 'The client uploads or emails documents.', 'Identifies, checks, renames and files each document, updates the checklist and chases anything outstanding.', 'You accept each document or return it with a note.', 'Documents verified · 7 of 9'],
    ['Application Preparation', 'The checklist reaches the threshold you set.', 'Maps verified details to the applicable forms and prepares browser-assisted prefill for the government website.', 'You check every mapped field and complete anything that needs judgment.', 'Forms prepared · ready for review'],
    ['Consultant Review', 'The application package is assembled.', 'Compiles a review pack that highlights exceptions, changed documents and open questions, and records the review trail.', 'Registered migration agent approval, then client confirmation. A material change invalidates the earlier approval.', 'Approved to lodge'],
    ['Lodgement', 'Approval and client confirmation are recorded.', 'Runs readiness checks, reminds you of the visa application charge and records the lodgement reference against the matter.', 'You lodge in ImmiAccount. Quantum never lodges on its own.', 'Lodged'],
    ['Post-Lodgement', 'An email arrives from the Department or the client.', 'Interprets the request, creates the task with a proposed date, assigns the owner, drafts a response and sends milestone updates you have approved.', 'You verify the legal deadline and approve the response.', 'Monitoring · action due'],
    ['Outcome', 'A decision notice is received.', 'Updates the matter, notifies the team, drafts the client message and schedules follow-ups such as visa expiry or the next pathway.', 'You communicate the outcome and close the matter.', 'Closed · outcome recorded'],
  ];
  function journey(el) {
    const short = el.dataset.journey === 'short';
    el.innerHTML = `<div class="j-rail" role="tablist" aria-label="Visa journey stages">${JOURNEY.map((j, i) => `<button class="j-tab" role="tab" id="jt${i}" aria-selected="false" aria-controls="jpanel" tabindex="-1"><span class="j-dot-row"><span class="j-dot"></span><span class="j-line"></span></span><span class="j-n">${String(i + 1).padStart(2, '0')}</span><span class="j-t">${j[0]}</span></button>`).join('')}</div>`;
    const panel = document.createElement('div'); panel.className = 'j-panel'; panel.id = 'jpanel'; panel.setAttribute('role', 'tabpanel');
    const tabs = $$('.j-tab', el), rail = $('.j-rail', el), mq = matchMedia('(max-width: 760px)');
    let cur = 0;
    const place = () => { if (mq.matches) tabs[cur].after(panel); else el.appendChild(panel); };
    const sel = (i, focus) => {
      cur = i; const j = JOURNEY[i];
      tabs.forEach((t, k) => { t.setAttribute('aria-selected', k === i); t.tabIndex = k === i ? 0 : -1; t.classList.toggle('is-past', k < i); });
      panel.setAttribute('aria-labelledby', 'jt' + i);
      panel.innerHTML = `<div class="j-intro"><div class="stack"><span class="eyebrow"><span class="num">Stage ${String(i + 1).padStart(2, '0')}</span> of 10</span><h3 class="h2" style="font-size:var(--text-xl)">${j[0]}</h3></div>
        <div class="stack"><div><div class="ui-label">Resulting status</div><div style="margin-top:8px"><span class="badge badge--live">${j[4]}</span></div></div>
        <div class="j-nav"><button class="round-btn" data-p aria-label="Previous stage" ${i === 0 ? 'disabled' : ''}>${I('arrow-left')}</button><button class="round-btn" data-n aria-label="Next stage" ${i === 9 ? 'disabled' : ''}>${I('arrow-right')}</button></div></div></div>
        <div class="j-cells"><div class="j-cell"><div class="ui-label">Trigger</div><p>${j[1]}</p></div>
        <div class="j-cell j-cell--ai"><div class="ui-label">AI action</div><p>${j[2]}</p></div>
        <div class="j-cell j-cell--you"><div class="ui-label">Consultant approval</div><p>${j[3]}</p></div>
        <div class="j-cell"><div class="ui-label">Visibility</div><p>Stage, owner, due dates and blockers are visible on the matter and in your pipeline. Timelines combine your internal SLAs with published processing benchmarks, labelled as estimates.</p></div></div>`;
      $('[data-p]', panel).onclick = () => sel(Math.max(0, i - 1));
      $('[data-n]', panel).onclick = () => sel(Math.min(9, i + 1));
      place(); icons();
      if (!mq.matches) { const t = tabs[i]; rail.scrollTo({ left: t.offsetLeft - rail.clientWidth / 2 + t.clientWidth / 2, behavior: reduce ? 'auto' : 'smooth' }); }
      if (focus) tabs[i].focus();
    };
    tabs.forEach((t, i) => { t.addEventListener('click', () => sel(i)); t.addEventListener('keydown', e => { const k = e.key; if (['ArrowRight', 'ArrowDown'].includes(k)) { e.preventDefault(); sel(Math.min(9, i + 1), true); } if (['ArrowLeft', 'ArrowUp'].includes(k)) { e.preventDefault(); sel(Math.max(0, i - 1), true); } if (k === 'Home') { e.preventDefault(); sel(0, true); } if (k === 'End') { e.preventDefault(); sel(9, true); } }); });
    mq.addEventListener('change', place);
    sel(short ? 4 : 0);
  }

  /* ---------------------------------------------------------- Ops explorer */
  const W = (title, body) => `<div class="win win--flat"><div class="win-bar"><div class="win-dots"><i></i><i></i><i></i></div><div class="win-title">${title}</div></div><div class="win-body">${body}</div></div>`;
  const OPS = [
    ['Document requests and reminders', 'Requests are written in your tone and reminders follow the cadence you set — until the document arrives.', () => S.list('Outstanding · VM-2041', 'Subclass 190 · 2 items', [['English test result', 'Requested 09/10 · reminder 16/10', 'warn', 'Chasing', 'tag--warn'], ['Form 80 signature', 'Requested 12/10 · reminder 19/10', 'warn', 'Chasing', 'tag--warn'], ['Birth certificate', 'Received 30/09', true, 'Received']], `<div class="ui-card ui-card--soft" style="margin-top:10px;padding:10px 12px"><div class="ui-label">Next reminder · draft</div><p class="ui-sub" style="margin-top:4px;line-height:1.5">Hi A., a quick reminder that we still need your English test result to keep your application on track…</p></div>`)],
    ['Expiry and requirement checks', 'Each document is checked for type, details, expiry and validity against the requirement set in your visa library.', () => S.checks('Checks · police_cert.pdf', [['Document type: police certificate', 'India · national level'], ['Name matches matter record', 'A. N•••••'], ['Issued 11/09/2026', 'Within your configured validity window'], ['Translation not required', 'Issued in English']])],
    ['Document filing', 'Files are renamed to your convention and stored in the right matter folder. No more downloads folders.', () => S.list('VM-2041 › Documents', 'Naming: Type_Initials_Date', [['Identity / Passport_AN_bio_14-10-2026.pdf', 'Renamed from passport_scan.pdf', true, 'Filed'], ['Character / PoliceCert_IN_AN_11-09-2026.pdf', 'Renamed from police_cert.pdf', true, 'Filed'], ['Skills / Assessment_AN_02-10-2026.pdf', 'Filed earlier', true, 'Filed']])],
    ['Checklist maintenance', 'Checklists are generated from the visa stream and the client\u2019s circumstances, then update themselves as documents arrive.', () => `<div class="ui-card"><div class="flex between items-center"><div><div class="ui-title">Checklist · Subclass 190</div><div class="ui-sub">Generated from stream rules and client answers</div></div><span class="tag tag--ai">Auto-updated</span></div><div class="bar" style="margin:14px 0 6px"><i style="width:78%"></i></div><div class="ui-sub">7 of 9 verified</div><div style="margin-top:8px">${[['Passport bio page', 1], ['Police certificates (all countries)', 1], ['Skills assessment outcome', 1], ['English test result', 2], ['Form 80', 2]].map(r => `<div class="ui-row">${r[1] === 2 ? T(false, 'is-warn') : T(true)}<div class="grow"><b>${r[0]}</b></div></div>`).join('')}</div></div>`],
    ['Applicable form preparation', 'Verified details are mapped to the forms that apply to this visa stream and prepared for your review.', () => S.form('Form preparation · VM-2041', [['Applicant family name', 'N•••••', true], ['Date of birth', '••/••/1993', true], ['Country of birth', 'India', true], ['Employment history', 'Needs consultant review', false]])],
    ['Browser-assisted prefill', 'A browser extension fills matching fields on government web forms. You check every entry; nothing is submitted for you.', () => `<div class="ui-card"><div class="flex between items-center"><div class="ui-title">Quantum extension</div><span class="tag tag--ai">38 fields prefilled</span></div><div style="margin-top:12px">${S.form('Government web form', [['Passport number', 'P•••••42', true], ['Passport expiry', '••/03/2031', true], ['Usual residential address', 'Requires consultant input', false]]).replace('class="ui-card"', 'class="ui-card ui-card--soft"')}</div><p class="ui-sub" style="margin-top:10px">Prefill only. Review, declaration and submission remain with the consultant.</p></div>`],
    ['Email-to-task conversion', 'Authorised inbound email from the Department and clients becomes a task with an owner, a proposed date and a draft reply.', () => S.task('Client reports change of address', [['Matter', 'VM-1932 · Subclass 500'], ['From', 'Client email'], ['Action', 'Notify the Department of the change']], 'P. Rao', 'Created 2:14 pm', 'Thanks for letting us know. We will update your details with the Department and confirm once done.')],
    ['Application timelines', 'Plan each matter by combining your internal SLAs with published government processing benchmarks.', () => `<div class="ui-card"><div class="ui-title">Indicative timeline · VM-2041</div><div class="ui-sub">Internal SLA + published benchmark · estimate only</div><div class="est-bar" style="margin-top:14px"><div class="a" style="flex:2.4">Documents</div><div class="a" style="flex:1.1;opacity:.82">Prep</div><div class="c" style="flex:.4"></div><div class="b" style="flex:6">Department processing (benchmark)</div></div><dl class="kv" style="margin-top:14px"><dt>Internal work</dt><dd>~5 weeks</dd><dt>Benchmark source</dt><dd>Published processing times</dd><dt>Status</dt><dd>On track</dd></dl></div>`],
    ['Visa fee and timeline estimators', 'Give clients a clear, itemised estimate of charges and time — clearly labelled as estimates.', () => `<div class="ui-card"><div class="flex between items-center"><div class="ui-title">Client estimate</div><span class="tag">Estimate</span></div><dl class="kv" style="margin-top:14px"><dt>Visa application charge (from library)</dt><dd>Disbursement</dd><dt>Additional applicants</dt><dd>1 adult · 1 child</dd><dt>Professional fees</dt><dd>Fixed fee + GST</dd><dt>Indicative timeline</dt><dd>Internal + benchmark</dd></dl><p class="ui-sub" style="margin-top:12px;line-height:1.5">Figures come from your approved visa library and fee schedule. Not a guarantee of cost or processing time.</p></div>`],
    ['Visa library change proposals', 'Government updates become proposals. After approval, changes flow to checklists, templates, fees and timelines.', () => S.list('Library proposals', '3 awaiting approval', [['Fee reference update · 3 streams', 'Source linked · effective date noted', 'warn', 'Proposed', 'tag--ai'], ['Form version change', 'Template mapping updated', 'warn', 'Proposed', 'tag--ai'], ['Checklist wording', 'Approved by J. Walker', true, 'Applied']])],
  ];
  function explorer(el) {
    el.innerHTML = `<div class="x-list" role="tablist" aria-orientation="vertical">${OPS.map((o, i) => `<button class="x-btn" role="tab" id="xt${i}" aria-selected="false" aria-controls="xpanel"><b>${o[0]}</b><span>${o[1]}</span></button>`).join('')}</div><div class="x-stage" id="xpanel" role="tabpanel"></div>`;
    const stage = $('.x-stage', el), btns = $$('.x-btn', el), mq = matchMedia('(min-width: 980px)');
    let cur = 0;
    const place = () => { if (mq.matches) el.appendChild(stage); else btns[cur].after(stage); };
    const sel = (i, f) => { cur = i; btns.forEach((b, k) => b.setAttribute('aria-selected', k === i)); stage.setAttribute('aria-labelledby', 'xt' + i); stage.innerHTML = W(`Visa operations · ${OPS[i][0]}`, OPS[i][2]()); place(); if (f) btns[i].focus(); };
    btns.forEach((b, i) => { b.addEventListener('click', () => sel(i)); b.addEventListener('keydown', e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel((i + (e.key === 'ArrowDown' ? 1 : OPS.length - 1)) % OPS.length, true); } }); });
    mq.addEventListener('change', place);
    sel(0);
  }

  /* --------------------------------------------------------------------- ROI */
  function roi(el) {
    const fields = [
      ['apps', 'Active applications per month', 1, 200, 40, 1, v => v],
      ['hrs', 'Administrative hours per application', 1, 30, 6, .5, v => v + ' h'],
      ['rate', 'Staff cost per hour (AUD, incl. on-costs)', 30, 150, 55, 1, v => '$' + v],
      ['share', 'Share of those hours you expect Quantum to assist', 0, 80, 30, 5, v => v + '%'],
      ['team', 'People doing this administration', 1, 30, 4, 1, v => v],
    ];
    el.innerHTML = `<div class="roi-in"><div><h3 class="h3">Estimate your potential savings</h3><p class="small muted mt-2">Use your own practice figures. Every input is editable.</p></div>
      ${fields.map(f => `<div class="field-range"><label class="lab" for="r-${f[0]}"><span>${f[1]}</span><output id="o-${f[0]}"></output></label><input type="range" id="r-${f[0]}" min="${f[2]}" max="${f[3]}" value="${f[4]}" step="${f[5]}">${f[0] === 'share' ? '<small>This is your assumption, not a measured Quantum benchmark.</small>' : ''}</div>`).join('')}</div>
      <div class="roi-out" aria-live="polite"><div class="roi-big"><span class="ui-label">Hours potentially redirected each month</span><span class="v" id="o-hours">0</span></div>
      <div class="roi-big"><span class="ui-label">Indicative value of that time</span><span class="v" id="o-value">$0</span><span class="k" id="o-year"></span></div>
      <div class="roi-mini"><div><div class="v" id="o-per">0 h</div><div class="k">per team member each month</div></div><div><div class="v" id="o-fte">0</div><div class="k">full-time equivalent (152 h/month)</div></div></div>
      <div class="assume"><b>Assumptions.</b> Hours redirected = applications × hours per application × your assisted share. Value = hours × staff cost. Excludes subscription, AI usage and onboarding costs. Results are illustrative only — we will replace them with measured timings from your own workflow during a demonstration.</div>
      <a class="btn btn--primary" href="/book-demo">Measure it with your workflow</a></div>`;
    const g = id => $('#r-' + id, el);
    const fmt = n => n.toLocaleString('en-AU', { maximumFractionDigits: 0 });
    const calc = () => {
      fields.forEach(f => { const i = g(f[0]); $('#o-' + f[0], el).textContent = f[6](+i.value); i.style.setProperty('--pn', (i.value - f[2]) / (f[3] - f[2])); });
      const h = +g('apps').value * +g('hrs').value * (+g('share').value / 100);
      const v = h * +g('rate').value;
      $('#o-hours', el).textContent = fmt(h);
      $('#o-value', el).textContent = '$' + fmt(v);
      $('#o-year', el).textContent = `About $${fmt(v * 12)} a year, before costs`;
      $('#o-per', el).textContent = (h / +g('team').value).toFixed(1) + ' h';
      $('#o-fte', el).textContent = (h / 152).toFixed(2);
    };
    $$('input', el).forEach(i => i.addEventListener('input', calc)); calc();
  }

  /* --------------------------------------------------------------- AI Matrix */
  const MATRIX = [
    ['Documents', [
      ['Request missing documents and send reminders', 'Uses your approved templates and cadence', 'auto'],
      ['Check expiry, validity and requirements', 'Against your visa library', 'auto'],
      ['Rename and file documents', 'To your naming convention', 'auto'],
      ['Update the checklist', 'As documents are checked', 'auto'],
      ['Accept a document as verified', 'Always a consultant decision', 'manual', true],
    ]],
    ['Forms', [
      ['Map verified data into forms', 'Only from accepted documents', 'review'],
      ['Browser-assisted prefill', 'Government web forms', 'review'],
      ['Lodge an application', 'Always performed by the consultant', 'manual', true],
    ]],
    ['Correspondence', [
      ['Create tasks from inbound email', 'Department and client email', 'auto'],
      ['Draft replies to clients', 'Sent after approval', 'review'],
      ['Draft responses to Department requests', 'Sent after approval', 'review'],
      ['Set governing legal deadlines', 'Practitioner verification required', 'manual', true],
    ]],
    ['Visa library', [
      ['Propose library updates from government changes', 'With source and impact', 'auto'],
      ['Apply approved updates across templates', 'After consultant approval', 'review'],
    ]],
    ['Growth', [
      ['After-hours AI receptionist', 'General service questions only', 'auto'],
      ['Qualify and route enquiries', 'Using your questions', 'auto'],
      ['Campaigns and milestone messages', 'Birthdays, approvals, reminders', 'review'],
      ['Draft service agreements and invoices', 'From your templates and fee schedule', 'review'],
    ]],
  ];
  function matrix(el) {
    const compact = el.dataset.matrix === 'compact';
    const keep = { Documents: [0, 4], Forms: [1, 2], Correspondence: [0, 3], 'Visa library': [0], Growth: [0] };
    const DATA = compact ? MATRIX.map(g => [g[0], g[1].filter((r, i) => keep[g[0]].includes(i))]) : MATRIX;
    const L = { auto: 'Automate', review: 'Review first', manual: 'Manual' };
    el.innerHTML = `<div class="matrix-head"><div><div class="ui-title" style="font-size:15px">AI Control Matrix</div><div class="ui-sub">Practice settings · applies to all matters unless overridden</div></div>
      <div class="matrix-legend"><span><span class="dot" style="color:var(--accent)"></span>Automate — AI acts, logged</span><span><span class="dot" style="color:var(--amber)"></span>Review first — AI drafts, you approve</span><span><span class="dot" style="color:var(--faint)"></span>Manual — your team does it</span></div></div>
      ${DATA.map(g => `<div class="m-group-title">${g[0]}</div>${g[1].map(r => `<div class="m-row"><div><b>${r[0]}</b><small>${r[1]}${r[3] ? ' · locked' : ''}</small></div><div class="seg" role="radiogroup" aria-label="${r[0]}">${['auto', 'review', 'manual'].map(v => `<button role="radio" data-v="${v}" aria-checked="${v === r[2]}" ${r[3] && v !== r[2] ? 'data-locked aria-disabled="true"' : ''}>${L[v]}</button>`).join('')}</div></div>`).join('')}`).join('')}
      <div class="matrix-foot"><span><b data-c="auto">0</b> automated · <b data-c="review">0</b> review first · <b data-c="manual">0</b> manual</span><span data-log>Every change is recorded in the audit trail.</span>${compact ? '<a class="link" href="ai-control-security.html#matrix">All ' + MATRIX.reduce((a, g) => a + g[1].length, 0) + ' controls ' + I('arrow-right') + '</a>' : ''}</div>`;
    const count = () => ['auto', 'review', 'manual'].forEach(v => $(`[data-c="${v}"]`, el).textContent = $$(`.seg button[data-v="${v}"][aria-checked="true"]`, el).length);
    $$('.seg', el).forEach(seg => seg.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b || b.hasAttribute('data-locked')) return;
      $$('button', seg).forEach(x => x.setAttribute('aria-checked', x === b));
      const now = new Date(); const tm = now.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
      $('[data-log]', el).innerHTML = `Audit: “${seg.getAttribute('aria-label')}” set to <b>${L[b.dataset.v]}</b> by Practice owner · ${tm}`;
      count();
    }));
    $$('.seg', el).forEach(seg => seg.addEventListener('keydown', e => {
      if (!['ArrowRight', 'ArrowLeft'].includes(e.key)) return; e.preventDefault();
      const bs = $$('button:not([data-locked])', seg); const i = bs.indexOf(document.activeElement); const n = bs[(i + (e.key === 'ArrowRight' ? 1 : bs.length - 1)) % bs.length]; n && (n.focus(), n.click());
    }));
    count();
  }

  /* ---------------------------------------------------------- Security UI */
  function options(el) {
    $$('.opt', el).forEach(o => o.addEventListener('click', () => { $$('.opt', el).forEach(x => x.setAttribute('aria-checked', x === o)); const out = el.querySelector('[data-opt-out]'); if (out) out.textContent = o.dataset.out || ''; }));
  }
  const AUDIT = [
    ['2026-10-14T09:02:11+11:00', 'AI', 'Quantum', 'Detected 2 attachments in client email', 'VM-2041', 'Completed'],
    ['2026-10-14T09:02:19+11:00', 'AI', 'Quantum', 'Checked passport bio page against Subclass 190 requirements', 'VM-2041', 'Passed'],
    ['2026-10-14T09:02:24+11:00', 'AI', 'Quantum', 'Filed Passport_AN_bio_14-10-2026.pdf', 'VM-2041', 'Completed'],
    ['2026-10-14T09:02:25+11:00', 'AI', 'Quantum', 'Updated checklist (7 of 9)', 'VM-2041', 'Completed'],
    ['2026-10-14T09:18:40+11:00', 'Human', 'S. Mehta (RMA)', 'Accepted passport bio page', 'VM-2041', 'Approved'],
    ['2026-10-14T09:31:02+11:00', 'AI', 'Quantum', 'Created task from Department email', 'VM-1874', 'Completed'],
    ['2026-10-14T09:44:57+11:00', 'Human', 'J. Walker (RMA)', 'Verified legal deadline 04/11/2026', 'VM-1874', 'Verified'],
    ['2026-10-14T10:05:13+11:00', 'Human', 'Practice owner', 'Changed AI setting: Draft replies to clients → Review first', 'Practice', 'Recorded'],
  ];
  function auditTimeline(el) {
    el.innerHTML = AUDIT.slice().reverse().slice(0, 6).map(a => `<div class="tl"><span class="avatar ${a[1] === 'AI' ? 'avatar--ai' : ''}">${a[1] === 'AI' ? sparkSvg : a[2].split(' ').map(w => w[0]).join('').replace(/[^A-Z]/g, '').slice(0, 2)}</span><div><b>${a[3]}</b><small>${a[2]} · ${a[4]} · ${a[5]}</small></div><time>${a[0].slice(11, 16)}</time></div>`).join('');
  }
  function auditExport(btn) {
    btn.addEventListener('click', () => {
      const rows = [['timestamp', 'actor_type', 'actor', 'action', 'matter', 'outcome'], ...AUDIT];
      const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'quantum-audit-log-sample.csv'; document.body.appendChild(a); a.click(); a.remove();
      const t = btn.innerHTML; btn.innerHTML = `${I('check')} Sample log downloaded`; icons(); setTimeout(() => { btn.innerHTML = t; icons(); }, 2400);
    });
  }

  /* ------------------------------------------------------------ Estimators */
  function estimator(el) {
    const g = id => $(`[name="${id}"]`, el);
    const calc = () => {
      const d = +g('docs').value || 0, p = +g('prep').value || 0, c = +g('conf').value || 0, b = (+g('bench').value || 0) * 30.4;
      const tot = d + p + c + b;
      $('.a1', el).style.flexGrow = d; $('.a2', el).style.flexGrow = p; $('.a3', el).style.flexGrow = c; $('.b1', el).style.flexGrow = b;
      const wk = Math.round((d + p + c) / 7), mo = (tot / 30.4);
      $('[data-int]', el).textContent = `${wk} weeks`;
      $('[data-tot]', el).textContent = `${mo.toFixed(1)} months`;
    };
    $$('input', el).forEach(i => i.addEventListener('input', calc)); calc();
  }
  function feeEst(el) {
    const g = id => +($(`[name="${id}"]`, el).value || 0);
    const fmt = n => '$' + n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const calc = () => {
      const vac = g('base') + g('adult') * g('adultc') + g('child') * g('childc');
      const prof = g('fee'), gst = prof * 0.1;
      $('[data-vac]', el).textContent = fmt(vac); $('[data-prof]', el).textContent = fmt(prof); $('[data-gst]', el).textContent = fmt(gst); $('[data-total]', el).textContent = fmt(vac + prof + gst);
    };
    $$('input', el).forEach(i => i.addEventListener('input', calc)); calc();
  }

  /* --------------------------------------------------------------- Modal */
  function modal(html, narrow) {
    const m = document.createElement('div'); m.className = 'modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
    m.innerHTML = `<div class="modal-box ${narrow ? 'modal-box--narrow' : ''}"><button class="modal-close" aria-label="Close">${I('x')}</button>${html}</div>`;
    document.body.appendChild(m); icons();
    const prev = document.activeElement;
    const close = () => { m.classList.remove('is-open'); document.removeEventListener('keydown', key); setTimeout(() => { m.remove(); prev && prev.focus(); }, 350); };
    const key = e => { if (e.key === 'Escape') close(); if (e.key === 'Tab') { const f = $$('button, a, input, [tabindex="0"]', m).filter(x => !x.disabled); if (!f.length) return; const a = f[0], z = f[f.length - 1]; if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } } };
    m.addEventListener('click', e => { if (e.target === m) close(); }); $('.modal-close', m).onclick = close; document.addEventListener('keydown', key);
    requestAnimationFrame(() => { m.classList.add('is-open'); $('.modal-close', m).focus(); });
    return m;
  }
  window.QVM.modal = modal;
  function watch(btn) {
    btn.addEventListener('click', e => {
      e.preventDefault();
      const m = modal(`<div class="modal-pad" style="padding-bottom:var(--space-6)"><span class="eyebrow">Watch it work · captioned</span><h2 class="h2 mt-2" style="font-size:var(--text-xl)">From an email attachment to a consultant review</h2><p class="muted small mt-2">A real document-to-checklist workflow. Personal information is masked.</p></div><div style="padding:0 clamp(var(--space-4),3vw,var(--space-8)) clamp(var(--space-4),3vw,var(--space-8))"><div data-wclip></div><div class="btn-row mt-6"><a class="btn btn--primary" href="/book-demo">Book a Demo</a><a class="btn btn--ghost" href="/how-it-works#tour">Explore the interactive tour</a></div></div>`);
      const all = [...CLIPS.docs.scenes, ...CLIPS.forms.scenes.slice(1)];
      Clip($('[data-wclip]', m), { scenes: all, per: 4200 });
    });
  }

  /* --------------------------------------------------------------- Forms */
  function demoForm(form) {
    // React StrictMode re-runs page effects on the same DOM in development.
    if (form.dataset.qvmForm === '1') return;
    form.dataset.qvmForm = '1';
    const succ = $('[data-success]');
    const showUnavailable = () => { form.style.display = 'none'; succ.classList.add('is-on'); succ.focus({ preventScroll: true }); succ.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' }); };
    const booking = setupBooking(form, { onUnavailable: showUnavailable, reduceMotion: reduce });
    form.addEventListener('submit', e => {
      e.preventDefault();
      let ok = true;
      $$('[required]', form).forEach(i => {
        const f = i.closest('.field') || i.closest('.fieldset');
        let bad = false;
        if (i.type === 'radio') bad = !$$(`[name="${i.name}"]`, form).some(r => r.checked);
        else if (i.type === 'checkbox') bad = !i.checked;
        else if (i.type === 'email') bad = !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(i.value.trim());
        else bad = !i.value.trim();
        if (f) f.classList.toggle('has-error', bad);
        if (i.type !== 'radio' && i.type !== 'checkbox') i.setAttribute('aria-invalid', bad);
        if (bad) ok = false;
      });
      if (!ok) { const first = $('.has-error', form); first && first.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' }); return; }
      if (booking) booking.onValid(); else showUnavailable();
    });
    const back = $('[data-back]', succ);
    back && back.addEventListener('click', () => { succ.classList.remove('is-on'); form.style.display = ''; $('[type="submit"]', form).focus(); });
    $$('input, select, textarea', form).forEach(i => i.addEventListener('input', () => { const f = i.closest('.field') || i.closest('.fieldset'); f && f.classList.remove('has-error'); i.removeAttribute('aria-invalid'); }));
    $$('input[type=radio], input[type=checkbox]', form).forEach(i => i.addEventListener('change', () => { const f = i.closest('.fieldset'); f && f.classList.remove('has-error'); }));
  }

  /* ------------------------------------------------------------ Subnav spy */
  function subnav(nav) {
    const links = $$('a', nav), secs = links.map(a => $(a.getAttribute('href'))).filter(Boolean);
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { links.forEach(l => l.classList.toggle('is-on', l.getAttribute('href') === '#' + e.target.id)); const on = links.find(l => l.classList.contains('is-on')); on && on.scrollIntoView({ inline: 'center', block: 'nearest' }); } }), { rootMargin: '-40% 0px -55% 0px' });
    secs.forEach(s => io.observe(s));
  }

  /* -------------------------------------------------------------- Boot (React-friendly) */
  function bootWidgets(root = document) {
    if (root.dataset.qvmBooted === '1') return;
    root.dataset.qvmBooted = '1';
    const scope = (sel) => $$(sel, root);
    scope('[data-hero-flow]').forEach(heroFlow);
    scope('[data-problems]').forEach(problems);
    scope('[data-diff]').forEach(difference);
    scope('[data-journey]').forEach(journey);
    scope('[data-explorer]').forEach(explorer);
    scope('[data-roi]').forEach(roi);
    scope('[data-matrix]').forEach(matrix);
    scope('[data-options]').forEach(options);
    scope('[data-audit]').forEach(auditTimeline);
    scope('[data-audit-export]').forEach(auditExport);
    scope('[data-estimator]').forEach(estimator);
    scope('[data-fee-est]').forEach(feeEst);
    scope('[data-watch]').forEach(watch);
    scope('[data-demo-form]').forEach(demoForm);
    scope('.subnav').forEach(subnav);
    scope('[data-clip]').forEach((el) => Clip(el, CLIPS[el.dataset.clip]));
    scope('[data-tour]').forEach((el) => {
      const chapters = [['Document to checklist', 'docs'], ['Expiry checks', 'expiry'], ['Document to form', 'forms'], ['Department correspondence', 'corr'], ['Visa library update', 'library']];
      const scenes = [], starts = [];
      chapters.forEach((c) => { starts.push(scenes.length); scenes.push(...CLIPS[c[1]].scenes); });
      const list = $('[data-tour-chapters]', root);
      if (!list) return;
      list.innerHTML = chapters.map((c, i) => `<button class="x-btn" data-ch="${i}" aria-selected="${i === 0}"><b>${c[0]}<span class="mono xs muted" style="display:inline">${String(Math.floor(starts[i] * 4.2 / 60)).padStart(1, '0')}:${String(Math.round(starts[i] * 4.2) % 60).padStart(2, '0')}</span></b></button>`).join('');
      const player = Clip(el, { scenes, per: 4200, autoplay: false, onScene: (i) => { let ch = 0; starts.forEach((s0, k) => { if (i >= s0) ch = k; }); $$('[data-ch]', list).forEach((b, k) => b.setAttribute('aria-selected', k === ch)); } });
      $$('[data-ch]', list).forEach((b) => b.addEventListener('click', () => player.seek(starts[+b.dataset.ch])));
    });
    scope('[data-switch]').forEach((s) => s.addEventListener('click', () => s.setAttribute('aria-checked', s.getAttribute('aria-checked') !== 'true')));
    icons();
    // Reveal only within this page root
    const els = scope('.reveal');
    if (reduce || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('is-in')); }
    else {
      const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
      els.forEach((e) => io.observe(e));
    }
    document.dispatchEvent(new Event('qvm:ready'));
  }

  window.QVM.bootWidgets = bootWidgets;
  window.QVM.header = header;
  window.QVM.footer = footer;
  window.QVM.theme = theme;
  window.QVM.chrome = chrome;
})();

export function bootWidgets(root) {
  if (window.QVM && typeof window.QVM.bootWidgets === 'function') {
    window.QVM.bootWidgets(root);
  }
}
