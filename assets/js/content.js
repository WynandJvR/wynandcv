/* content.js: toolkit, work list and project detail sheet */
(function () {
  'use strict';

  /* Skill data */
  const SKILL_GROUPS = [
    {
      id: 'languages',
      name: 'Languages',
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

  const PROJECTS = [
    {
      id: 'automation',
      title: 'SLS Consultants',
      year: 'WaltWorks, 2026 to now',
      blurb: 'A production platform for SLS Consultants that uses AI to take hours of manual data work off their team.',
      tags: ['PHP', 'MySQL', 'AI'],
      detail: [
        'A production platform built for SLS Consultants at WaltWorks. It uses AI to automate data work their team used to do by hand.',
        'I work on it across the full stack, from the database through to the interface their team uses every day.'
      ],
      points: [
        'Full-stack ownership of features, from database to interface',
        'AI-assisted automation of previously manual work',
        'Running in production since 2026'
      ]
    },
    {
      id: 'portals',
      title: 'Potatoes South Africa',
      year: 'WaltWorks, 2025 to 2026',
      blurb: 'Eleven web portals for Potatoes South Africa, running serverless on AWS from one shared Go codebase.',
      tags: ['Go', 'AWS Lambda', 'HTMX'],
      detail: [
        'A suite of eleven web portals built for Potatoes South Africa at WaltWorks, running serverless on AWS Lambda.',
        'I built features across most of the portals, from the data layer through to the pages their members and staff use.'
      ],
      points: [
        'Eleven portals sharing one Go codebase',
        'Serverless on AWS Lambda, scaling with demand',
        'Server-rendered pages for a fast, light front end',
        'Dashboards, reporting and member-facing workflows'
      ]
    },
    {
      id: 'expensetracker',
      title: 'Expense Tracker',
      year: 'Personal project',
      blurb: 'JavaFX desktop app with receipt OCR, budgets and spending analytics. Runnable live on this page.',
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
      id: 'homelab',
      title: 'On-demand containers',
      year: 'Self-hosted',
      blurb: 'A Node service that starts a disposable Docker container per visitor and streams the app into the browser.',
      tags: ['Node.js', 'Docker', 'Linux'],
      detail: [
        'Showing someone a desktop app usually means asking them to clone a repo and install a JDK. I wanted a button instead.',
        'A Node service on the Pi receives the request, starts a disposable container on a second machine, and streams its screen into the browser. Sessions are single-tenant and time-boxed, and the container is destroyed afterwards.'
      ],
      points: [
        'Docker API reached over an SSH tunnel, never an exposed TCP socket',
        'One session at a time with automatic expiry and cleanup',
        'Containers seeded with realistic sample data so the demo is useful immediately',
        'Reports the demo machine as offline instead of failing silently'
      ]
    },
    {
      id: 'gym',
      title: 'FIT@NWU',
      year: 'University team project',
      blurb: 'Bookings, member management and React analytics dashboards for the North-West University gym.',
      tags: ['React', 'MySQL', 'MongoDB'],
      detail: [
        'A gym management application covering the whole member lifecycle: sign-up, class and equipment bookings, and the analytics staff need to run the facility.',
        'React on the front end with a hybrid data layer: MySQL for the relational core, MongoDB where the data needed to stay flexible.'
      ],
      points: [
        'React dashboards visualising attendance and facility usage',
        'Booking system with availability handling and conflict prevention',
        'Member management across MySQL and MongoDB',
        'Built as a team under real deadline pressure'
      ]
    },
    {
      id: 'bombfinder',
      title: 'Bomb Finder',
      year: 'Personal project',
      blurb: 'A Minesweeper-style game in Java with grid generation and flood-fill reveal logic.',
      tags: ['Java', 'Game Dev', 'GUI'],
      detail: [
        'A Minesweeper clone written in Java. The recursive flood-fill reveal and the adjacency counting are both easy to get subtly wrong, which made it a useful exercise.'
      ],
      points: [
        'Randomised grid generation with safe openings',
        'Recursive flood-fill reveal for empty regions',
        'Adjacency counting and flagging mechanics'
      ]
    },
    {
      id: 'portfolio',
      title: 'This site',
      year: 'Ongoing',
      blurb: 'No frameworks, served from a Raspberry Pi, with a 3D model of that Pi driven by its live readings.',
      tags: ['JavaScript', 'three.js', 'nginx'],
      github: 'https://github.com/WynandJvR/wynandcv',
      detail: [
        'Hand-written HTML, CSS and JavaScript with no build step. The only library is three.js, for the board in the hero, and it is served from the Pi too.',
        'The model reacts to the real machine: the chip glows with its actual temperature, heat rises with CPU load, and every telemetry request flashes the Ethernet LEDs.'
      ],
      points: [
        'Procedural 3D Raspberry Pi 4 in three.js, paused when off-screen',
        'Live telemetry polled every five seconds',
        'Ctrl+K command palette and a working in-page shell',
        'Served by nginx on the Pi through a Cloudflare Tunnel'
      ]
    }
  ];

  /* Render */
  document.addEventListener('DOMContentLoaded', function () {
    drawPortals();
    initSheet();

    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-open]');
      if (btn) openSheet(btn.dataset.open);
    });

    // Expose for the terminal and command palette
    window.Site.data = { skills: SKILL_GROUPS, projects: PROJECTS };
    window.Site.openProject = openSheet;
    window.Site.showSkillGroup = () => {};
  });

  /* Eleven portal tiles around one shared core, lighting up in turn */
  function drawPortals() {
    const svg = document.getElementById('portalsViz');
    if (!svg) return;
    const cx = 240, cy = 180, r = 128;
    let lines = '', tiles = '';
    for (let i = 0; i < 11; i++) {
      const a = -Math.PI / 2 + (i / 11) * Math.PI * 2;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.86;
      lines += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="viz-line" style="--i:${i}"/>`;
      tiles += `<g class="portal" style="--i:${i}"><rect x="${(x - 19).toFixed(1)}" y="${(y - 15).toFixed(1)}" width="38" height="30" rx="6"/>` +
               `<text x="${x.toFixed(1)}" y="${(y + 5).toFixed(1)}" text-anchor="middle">λ</text></g>`;
    }
    svg.innerHTML = lines + tiles +
      `<g class="portal-core"><circle cx="${cx}" cy="${cy}" r="40"/><text x="${cx}" y="${cy + 7}" text-anchor="middle">go</text></g>`;
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
    if (p.demo) actions.push(`<button class="btn btn--primary btn--sm" data-demo="${p.demo}">Run the live demo</button>`);
    if (p.github) actions.push(`<a class="btn btn--ghost btn--sm" href="${p.github}" target="_blank" rel="noopener">Source on GitHub</a>`);

    document.getElementById('sheetTags').innerHTML =
      `<span class="chip">${p.tags.join(' · ')}</span>` +
      (actions.length ? `<div class="sheet__actions">${actions.join('')}</div>` : '');

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
