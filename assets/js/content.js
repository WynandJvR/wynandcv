/* content.js: skills explorer, project grid, filters and detail sheet */
(function () {
  'use strict';

  /* Skill data */
  const ICON = {
    code: '<path stroke-linecap="round" stroke-linejoin="round" d="M9 18l-5-6 5-6M15 6l5 6-5 6"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path stroke-linecap="round" d="M3 12h18M12 3a15 15 0 010 18M12 3a15 15 0 000 18"/>',
    db: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path stroke-linecap="round" d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
    server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path stroke-linecap="round" d="M7 7.5h.01M7 16.5h.01"/>'
  };

  const SKILL_GROUPS = [
    {
      id: 'languages',
      name: 'Languages',
      icon: 'code',
      skills: [
        { name: 'Go', level: 85, note: 'Serverless portals, AWS Lambda handlers' },
        { name: 'PHP', level: 85, note: 'Production 8.3 platform, front to back' },
        { name: 'JavaScript', level: 80, note: 'Front end, Node services, this site' },
        { name: 'Java', level: 75, note: 'JavaFX desktop apps, OOP coursework' },
        { name: 'Python', level: 70, note: 'Lambda functions, tooling, automation' },
        { name: 'C#', level: 60, note: '.NET coursework and tooling' }
      ]
    },
    {
      id: 'web',
      name: 'Web & Frontend',
      icon: 'globe',
      skills: [
        { name: 'HTML & CSS', level: 90, note: 'Hand-written design systems' },
        { name: 'Tailwind CSS', level: 85, note: 'Used across every client platform' },
        { name: 'HTMX', level: 85, note: 'Server-driven UI without a SPA' },
        { name: 'templ', level: 80, note: 'Type-safe Go HTML templates' },
        { name: 'Alpine.js', level: 75, note: 'Lightweight client-side interactivity' },
        { name: 'React', level: 65, note: 'FIT@NWU analytics dashboards' }
      ]
    },
    {
      id: 'data',
      name: 'Data & Storage',
      icon: 'db',
      skills: [
        { name: 'PostgreSQL', level: 85, note: 'Schema design, migrations, reporting' },
        { name: 'MySQL', level: 85, note: 'Primary store on a production platform' },
        { name: 'SQLC', level: 75, note: 'Type-safe Go queries from raw SQL' },
        { name: 'MongoDB', level: 60, note: 'Document stores for flexible data' }
      ]
    },
    {
      id: 'infra',
      name: 'Cloud & Infrastructure',
      icon: 'server',
      skills: [
        { name: 'AWS Lambda', level: 80, note: 'Eleven portals running serverless' },
        { name: 'AWS SAM', level: 75, note: 'Infrastructure as code and deploys' },
        { name: 'Linux', level: 80, note: 'Ubuntu servers, Nginx, PHP-FPM' },
        { name: 'Git', level: 85, note: '800+ commits across client repos' },
        { name: 'Docker', level: 75, note: 'Containerised demo sandboxes' },
        { name: 'Raspberry Pi', level: 85, note: 'Hosts everything you are looking at' }
      ]
    }
  ];

  const MARQUEE = [
    'Go', 'PHP', 'JavaScript', 'Java', 'Python', 'C#', 'Echo', 'templ', 'HTMX',
    'Alpine.js', 'Tailwind', 'React', 'Node.js', 'PostgreSQL', 'MySQL', 'SQLC',
    'MongoDB', 'AWS Lambda', 'AWS SAM', 'S3', 'OpenAI API', 'Nginx', 'Linux',
    'Docker', 'Git', 'Raspberry Pi'
  ];

  const PROJECTS = [
    {
      id: 'sls',
      title: 'SLS Consultants Platform',
      year: 'WaltWorks, 2026 to present',
      icon: 'db',
      blurb: 'PHP and MySQL platform for SLS Consultants with AI-assisted data processing, built across the full stack.',
      tags: ['PHP', 'MySQL', 'OpenAI API', 'Tailwind'],
      detail: [
        'A production platform for SLS Consultants, built on PHP 8.3 with strict types and MySQL 8, deployed to Nginx and PHP-FPM on Ubuntu.',
        'I work on it across the full stack: database schema and migrations, the service layer, and the Tailwind front end on top. The OpenAI API is used to automate processing that would otherwise be manual.'
      ],
      points: [
        'PHP 8.3 with strict types, organised as controllers, services and models',
        'MySQL 8 schema design with versioned migrations',
        'OpenAI API integration for automated data processing',
        'Tailwind front end with vanilla JavaScript, no SPA framework',
        'Deployed to Nginx and PHP-FPM on Ubuntu'
      ]
    },
    {
      id: 'psa',
      title: 'PSA Serverless Portals',
      year: 'WaltWorks, 2025 to 2026',
      icon: 'server',
      blurb: 'Eleven serverless Go portals for Potatoes South Africa on AWS Lambda, server-rendered with templ and HTMX instead of a SPA framework.',
      tags: ['Go', 'AWS Lambda', 'HTMX', 'PostgreSQL'],
      detail: [
        'A suite of serverless applications for Potatoes South Africa, each portal a standalone AWS SAM deployment sharing a common Go package. The stack is Go with Echo and templ on the backend, HTMX and Alpine.js on the front end, and PostgreSQL underneath with SQLC generating the query layer.',
        'My work ran across most of the portals, from database migrations and service logic through to the interface.'
      ],
      points: [
        'Eleven standalone AWS SAM deployments sharing one Go package',
        'Multi-step verification flows with document upload, approval and rejection paths',
        'Reporting dashboards with aggregated figures and monitoring views',
        'Group messaging with a cross-portal notification system',
        'Third-party accounting integration and a task and project dashboard',
        'Automated templated HTML email reporting',
        'Type-safe query layer generated with SQLC, plus database migrations',
        'Shared toast notification system and dark mode across the suite'
      ]
    },
    {
      id: 'expensetracker',
      title: 'Expense Tracker',
      year: 'Personal project',
      icon: 'chart',
      blurb: 'JavaFX desktop app with receipt OCR, budgets, category management and spending analytics. Runnable live below.',
      tags: ['Java', 'JavaFX', 'OCR'],
      demo: 'expensetracker',
      github: 'https://github.com/WynandJvR/ExpenseTracker',
      detail: [
        'A desktop expense tracker built in JavaFX. I wrote it because I wanted to use it, not as a tutorial exercise.',
        'It scans receipts with OCR to pull amounts out automatically, tracks budgets per category, and charts where the money actually went.'
      ],
      points: [
        'OCR receipt scanning to cut manual entry',
        'Budget tracking with per-category limits',
        'Visual spending analytics over time',
        'Packaged into a container so you can run it here without installing Java'
      ]
    },
    {
      id: 'fitnwu',
      title: 'FIT@NWU Fitness Platform',
      year: 'University project',
      icon: 'globe',
      blurb: 'Gym management platform with React analytics dashboards, bookings and member management.',
      tags: ['React', 'MySQL', 'MongoDB'],
      detail: [
        'FIT@NWU is a gym management application covering the whole member lifecycle: sign-up, class and equipment bookings, and the analytics staff need to run the facility.',
        'The frontend is React, with a hybrid data layer. MySQL holds the relational core (members, bookings), MongoDB holds the parts where the data needed to stay flexible.'
      ],
      points: [
        'React dashboards visualising attendance and facility usage',
        'Booking system with availability handling and conflict prevention',
        'Member management across MySQL and MongoDB',
        'Built as a team project under real deadline pressure'
      ]
    },
    {
      id: 'bombfinder',
      title: 'Bomb Finder',
      year: 'Personal project',
      icon: 'game',
      blurb: 'A Minesweeper-style game in Java with grid generation, flood-fill reveal logic and a clean desktop GUI.',
      tags: ['Java', 'Game Dev', 'GUI'],
      detail: [
        'A Minesweeper clone written in Java. The recursive flood-fill reveal and the bomb-adjacency counting are both easy to get subtly wrong, which made it a useful exercise.',
        'Wrapped in a straightforward GUI with the usual flagging, timing and difficulty options.'
      ],
      points: [
        'Randomised grid generation with guaranteed-solvable openings',
        'Recursive flood-fill reveal for empty regions',
        'Adjacency counting and flagging mechanics',
        'Desktop GUI built around the game loop'
      ]
    },
    {
      id: 'portfolio',
      title: 'This Portfolio',
      year: 'Ongoing',
      icon: 'code',
      blurb: 'Hand-built with zero frameworks: canvas constellation, command palette, an in-page shell and live server telemetry.',
      tags: ['JavaScript', 'CSS', 'Canvas'],
      github: 'https://github.com/WynandJvR/wynandcv',
      detail: [
        'Everything here is hand-written. No Tailwind build, no React, no component library, just a CSS design system built on custom properties and vanilla JavaScript modules.',
        'It has an animated canvas constellation that reacts to your cursor, a Ctrl+K command palette, a working in-page terminal, and a live telemetry feed from the Raspberry Pi hosting it.'
      ],
      points: [
        'Canvas particle constellation with cursor repulsion, paused when off-screen',
        'Command palette with fuzzy matching and full keyboard navigation',
        'Interactive shell with tab completion and command history',
        'Live Pi telemetry for CPU, memory, disk, temperature, load and uptime',
        'Weather effects driven by your actual location',
        'Full light and dark theming with reduced-motion support'
      ]
    },
    {
      id: 'homelab',
      title: 'Self-Hosted Demo Platform',
      year: 'Ongoing',
      icon: 'server',
      blurb: 'Node orchestrator that spins up throwaway Docker containers so visitors can run my desktop apps in-browser.',
      tags: ['Node.js', 'Docker', 'Linux'],
      detail: [
        'Showing someone a desktop app usually means asking them to clone a repo and install a JDK. I wanted a link instead.',
        'A Node service on my own hardware receives a demo request, starts a disposable Docker container running the app on a virtual display, and streams the session into the browser. Sessions are single-tenant and time-boxed, and the container is destroyed afterwards.'
      ],
      points: [
        'Node.js orchestrator talking to the Docker API over an SSH tunnel rather than an exposed TCP socket',
        'One session at a time with automatic expiry and cleanup',
        'Containers seeded with realistic sample data so the demo is useful immediately',
        'Runs on a ThinkCentre reached over Tailscale, fronted by the Pi'
      ]
    }
  ];

  const PROJECT_ICONS = {
    db: ICON.db,
    globe: ICON.globe,
    code: ICON.code,
    server: ICON.server,
    chart: '<path stroke-linecap="round" stroke-linejoin="round" d="M4 19V10m6 9V5m6 14v-7"/>',
    game: '<circle cx="12" cy="12" r="9"/><path stroke-linecap="round" stroke-linejoin="round" d="M14.7 11.2l-3.2-2.1a1 1 0 00-1.5.8v4.2a1 1 0 001.5.9l3.2-2.1a1 1 0 000-1.7z"/>'
  };

  const svg = (path) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${path}</svg>`;

  /* Render */
  document.addEventListener('DOMContentLoaded', function () {
    renderSkills();
    renderMarquee();
    renderProjects();
    initSheet();

    // Expose for the terminal and command palette
    window.Site.data = { skills: SKILL_GROUPS, projects: PROJECTS };
    window.Site.openProject = openSheet;
  });

  /* Skills UI */
  function renderSkills() {
    const groupsEl = document.getElementById('skillGroups');
    const panelEl = document.getElementById('skillPanel');
    if (!groupsEl || !panelEl) return;

    groupsEl.innerHTML = SKILL_GROUPS.map((g, i) => `
      <button class="skill-group${i === 0 ? ' is-active' : ''}" data-group="${g.id}">
        <span class="icon-tile">${svg(ICON[g.icon])}</span>
        <span>
          <span class="skill-group__name">${g.name}</span><br/>
          <span class="skill-group__count">${g.skills.length} skills</span>
        </span>
        <span class="skill-group__arrow">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 6l6 6-6 6"/>
          </svg>
        </span>
      </button>`).join('');

    function showGroup(id) {
      const group = SKILL_GROUPS.find((g) => g.id === id) || SKILL_GROUPS[0];
      panelEl.innerHTML = `
        <div style="display:flex;align-items:baseline;justify-content:space-between;gap:1rem;margin-bottom:1.5rem">
          <h3 style="font-size:var(--step-1)">${group.name}</h3>
          <span class="skill-group__count">${group.skills.length} entries</span>
        </div>
        <div class="skill-list">
          ${group.skills.map((s, i) => `
            <div class="skill-row" style="animation-delay:${i * 60}ms">
              <div class="skill-row__head">
                <span class="skill-row__name">${s.name}</span>
                <span class="skill-row__lvl">${s.note}</span>
              </div>
              <div class="skill-row__track"><div class="skill-row__bar" data-level="${s.level}"></div></div>
            </div>`).join('')}
        </div>`;

      requestAnimationFrame(() => {
        panelEl.querySelectorAll('.skill-row__bar').forEach((bar, i) => {
          setTimeout(() => { bar.style.width = bar.dataset.level + '%'; }, 90 + i * 70);
        });
      });
    }

    groupsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.skill-group');
      if (!btn) return;
      groupsEl.querySelectorAll('.skill-group').forEach((b) => b.classList.toggle('is-active', b === btn));
      showGroup(btn.dataset.group);
    });

    // Animate the default group in once the section is reached
    let started = false;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !started) { started = true; showGroup(SKILL_GROUPS[0].id); }
    }, { threshold: 0.2 });
    io.observe(panelEl);
    panelEl.innerHTML = '<div style="color:var(--text-3);font-family:var(--font-mono);font-size:var(--step--2)">Loading toolkit…</div>';

    window.Site.showSkillGroup = (id) => {
      started = true;
      const btn = groupsEl.querySelector(`[data-group="${id}"]`);
      if (btn) {
        groupsEl.querySelectorAll('.skill-group').forEach((b) => b.classList.toggle('is-active', b === btn));
      }
      showGroup(id);
    };
  }

  function renderMarquee() {
    const track = document.getElementById('marqueeTrack');
    if (!track) return;
    const items = MARQUEE.map((t) => `<span class="marquee__item">${t}</span>`).join('');
    track.innerHTML = items + items; // duplicated for a seamless loop
  }

  /* Projects UI */
  function renderProjects() {
    const grid = document.getElementById('projectGrid');
    const filterBar = document.getElementById('projectFilters');
    if (!grid) return;

    const allTags = ['All'].concat(
      Array.from(new Set(PROJECTS.flatMap((p) => p.tags))).sort()
    );

    if (filterBar) {
      filterBar.innerHTML = allTags
        .map((t, i) => `<button class="filter${i === 0 ? ' is-active' : ''}" data-tag="${t}">${t}</button>`)
        .join('');
    }

    grid.innerHTML = PROJECTS.map((p, i) => `
      <article class="card card--spot project" data-reveal="scale" style="--reveal-delay:${Math.min(i * 60, 260)}ms"
               data-id="${p.id}" data-tags="${p.tags.join('|')}" tabindex="0" role="button"
               aria-label="Open details for ${p.title}">
        <div class="project__top">
          <span class="icon-tile">${svg(PROJECT_ICONS[p.icon] || ICON.code)}</span>
          <span>
            <h3 class="project__title">${p.title}</h3>
            <span class="project__year">${p.year}</span>
          </span>
        </div>
        <p class="project__desc">${p.blurb}</p>
        <div class="project__tags">${p.tags.map((t) => `<span class="chip">${t}</span>`).join('')}</div>
        <span class="project__more">
          Details
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14m0 0l-6-6m6 6l-6 6"/>
          </svg>
        </span>
      </article>`).join('');

    if (window.Site.observeReveals) window.Site.observeReveals(grid);

    if (filterBar) {
      filterBar.addEventListener('click', (e) => {
        const btn = e.target.closest('.filter');
        if (!btn) return;
        filterBar.querySelectorAll('.filter').forEach((b) => b.classList.toggle('is-active', b === btn));
        applyFilter(btn.dataset.tag);
      });
    }

    function applyFilter(tag) {
      let shown = 0;
      grid.querySelectorAll('.project').forEach((card) => {
        const match = tag === 'All' || card.dataset.tags.split('|').indexOf(tag) !== -1;
        card.classList.toggle('is-dimmed', !match);
        if (match) shown++;
      });
      window.Site.log(`[FILTER] ${tag} → ${shown} project${shown === 1 ? '' : 's'}`);
    }

    grid.addEventListener('click', (e) => {
      const card = e.target.closest('.project');
      if (card) openSheet(card.dataset.id);
    });
    grid.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const card = e.target.closest('.project');
      if (card) { e.preventDefault(); openSheet(card.dataset.id); }
    });

    window.Site.filterProjects = applyFilter;
  }

  /* Detail sheet */
  let sheet, sheetOpener;

  function initSheet() {
    sheet = document.getElementById('sheet');
    if (!sheet) return;
    const close = document.getElementById('sheetClose');
    if (close) close.addEventListener('click', closeSheet);
    sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && sheet.classList.contains('is-open')) closeSheet();
    });
  }

  function openSheet(id) {
    const p = PROJECTS.find((x) => x.id === id);
    if (!p || !sheet) return;

    sheetOpener = document.activeElement;
    document.getElementById('sheetTitle').textContent = p.title;
    document.getElementById('sheetMeta').textContent = p.year;
    document.getElementById('sheetBody').innerHTML = p.detail.map((d) => `<p>${d}</p>`).join('');
    document.getElementById('sheetList').innerHTML = p.points.map((d) => `<li>${d}</li>`).join('');

    const actions = [];
    if (p.demo) actions.push(`<button class="btn btn--primary btn--sm" data-demo="${p.demo}">Run live demo</button>`);
    if (p.github) actions.push(`<a class="btn btn--ghost btn--sm" href="${p.github}" target="_blank" rel="noopener">View on GitHub</a>`);

    document.getElementById('sheetTags').innerHTML =
      p.tags.map((t) => `<span class="chip chip--gold">${t}</span>`).join('') +
      (actions.length ? `<div style="flex-basis:100%;display:flex;gap:.6rem;flex-wrap:wrap;margin-top:1rem">${actions.join('')}</div>` : '');

    const demoBtn = sheet.querySelector('[data-demo]');
    if (demoBtn) {
      demoBtn.addEventListener('click', () => {
        closeSheet();
        if (window.demoManager) window.demoManager.start(demoBtn.dataset.demo);
      });
    }

    sheet.classList.add('is-open');
    document.body.classList.add('is-locked');
    const closeBtn = document.getElementById('sheetClose');
    if (closeBtn) closeBtn.focus();
    window.Site.log(`[PROJECT] opened "${p.title}"`);
  }

  function closeSheet() {
    if (!sheet) return;
    sheet.classList.remove('is-open');
    document.body.classList.remove('is-locked');
    if (sheetOpener && sheetOpener.focus) sheetOpener.focus();
  }
})();
