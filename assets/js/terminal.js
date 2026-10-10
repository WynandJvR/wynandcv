/* ==========================================================================
   terminal.js: in-page shell and live log console
   ========================================================================== */
(function () {
  'use strict';

  let consoleEl, outEl, inputEl, formEl;
  const commandHistory = [];
  let historyIndex = -1;
  let draft = '';

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ------------------------------------------------------------- Output */
  function print(html) {
    if (!outEl) return;
    const p = document.createElement('p');
    p.innerHTML = html;
    outEl.appendChild(p);
    outEl.scrollTop = outEl.scrollHeight;
  }

  function printLines(lines) { lines.forEach(print); }

  function printTable(rows) {
    const html = rows
      .map(([k, v]) => `<span class="c-accent">${esc(k)}</span>&nbsp;&nbsp;<span>${v}</span>`)
      .join('<br/>');
    print(html);
  }

  /* ----------------------------------------------------------- Commands */
  const COMMANDS = {
    help: {
      desc: 'List every available command',
      run() {
        print('<span class="c-text">Available commands</span>');
        print('');
        Object.keys(COMMANDS).sort().forEach((name) => {
          print(`  <span class="c-accent">${name.padEnd(11, '\u00a0')}</span><span class="c-dim">${esc(COMMANDS[name].desc)}</span>`);
        });
        print('');
        print('<span class="c-dim">Tab completes · ↑ ↓ walk history · Ctrl+K opens the command palette</span>');
      }
    },

    whoami: {
      desc: 'Who is behind this site',
      run() {
        printLines([
          '<span class="c-text">Wynand Janse van Rensburg</span>',
          '<span class="c-dim">Full-stack Developer at WaltWorks</span>',
          '',
          'I build client platforms end to end. Since 2025 I have shipped into two',
          'production systems: eleven serverless portals for Potatoes South Africa,',
          'and a platform for SLS Consultants that uses AI to automate manual work.',
          '',
          'BSc Information Technology, North-West University, 2025.',
          '',
          '<span class="c-dim">Try:</span> <span class="c-accent">skills</span>, <span class="c-accent">projects</span>, <span class="c-accent">stats</span>, <span class="c-accent">contact</span>'
        ]);
      }
    },

    about: {
      desc: 'Background and current work',
      run() {
        printLines([
          'Full-stack developer at WaltWorks since 2025.',
          '',
          'I work across the whole stack: database schema and migrations, backend services',
          'and APIs, and the front end sitting on top of them. Day to day that means Go on',
          'AWS Lambda and PHP 8.3 on Nginx, with PostgreSQL and MySQL underneath.',
          '',
          'I care about software that holds up in production, because the systems I work',
          'on are the ones people use to do their jobs.'
        ]);
      }
    },

    skills: {
      desc: 'Show the toolkit: skills [group]',
      complete: () => (window.Site.data ? window.Site.data.skills.map((g) => g.id) : []),
      run(args) {
        const groups = (window.Site.data && window.Site.data.skills) || [];
        if (!groups.length) { print('<span class="c-bad">Skill data not loaded yet.</span>'); return; }

        const wanted = args[0]
          ? groups.filter((g) => g.id === args[0].toLowerCase() || g.name.toLowerCase().indexOf(args[0].toLowerCase()) === 0)
          : groups;

        if (!wanted.length) {
          print(`<span class="c-bad">No such group: ${esc(args[0])}</span>`);
          print('<span class="c-dim">Groups: ' + groups.map((g) => g.id).join(', ') + '</span>');
          return;
        }

        wanted.forEach((g) => {
          print(`<span class="c-text">${esc(g.name)}</span>`);
          g.skills.forEach((s) => {
            const filled = Math.round(s.level / 10);
            const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
            print(`  <span class="c-accent">${bar}</span>  ${esc(s.name.padEnd(14, '\u00a0'))} <span class="c-dim">${esc(s.note)}</span>`);
          });
          print('');
        });
        if (args[0]) window.Site.showSkillGroup && window.Site.showSkillGroup(wanted[0].id);
      }
    },

    projects: {
      desc: 'List projects: projects [id] for detail',
      complete: () => (window.Site.data ? window.Site.data.projects.map((p) => p.id) : []),
      run(args) {
        const list = (window.Site.data && window.Site.data.projects) || [];
        if (!args[0]) {
          print('<span class="c-text">Projects</span>');
          print('');
          list.forEach((p) => {
            print(`  <span class="c-accent">${esc(p.id.padEnd(16, '\u00a0'))}</span>${esc(p.title)} <span class="c-dim">[${esc(p.tags.join(', '))}]</span>`);
          });
          print('');
          print('<span class="c-dim">Run</span> <span class="c-accent">projects &lt;id&gt;</span> <span class="c-dim">for the full write-up.</span>');
          return;
        }
        const p = list.find((x) => x.id === args[0].toLowerCase());
        if (!p) { print(`<span class="c-bad">No project called "${esc(args[0])}".</span>`); return; }

        print(`<span class="c-text">${esc(p.title)}</span> <span class="c-dim">${esc(p.year)}</span>`);
        print('');
        p.detail.forEach((d) => { print(esc(d)); print(''); });
        p.points.forEach((d) => print(`  <span class="c-accent">▸</span> ${esc(d)}`));
        print('');
        print(`<span class="c-dim">Tags:</span> ${esc(p.tags.join(', '))}`);
        if (p.github) print(`<span class="c-dim">Source:</span> <a href="${p.github}" target="_blank" rel="noopener">${esc(p.github)}</a>`);
        if (p.demo) print(`<span class="c-dim">Run it:</span> <span class="c-accent">demo ${esc(p.demo)}</span>`);
        window.Site.openProject && window.Site.openProject(p.id);
      }
    },

    education: {
      desc: 'Education and milestones',
      run() {
        printTable([
          ['2025-now', 'Full-stack Developer at WaltWorks'],
          ['2026-now', 'SLS Consultants platform (PHP, MySQL, AI)'],
          ['2025-26', 'Potatoes South Africa portals (Go, AWS Lambda)'],
          ['2023-25', 'BSc Information Technology, North-West University'],
          ['Ongoing', 'Self-hosted infrastructure on Linux, Docker and Raspberry Pi']
        ]);
      }
    },

    contact: {
      desc: 'How to reach me',
      run() {
        printTable([
          ['email', `<a href="mailto:${window.Site.email}">${esc(window.Site.email || '')}</a>`],
          ['github', '<a href="https://github.com/WynandJvR" target="_blank" rel="noopener">github.com/WynandJvR</a>'],
          ['linkedin', '<a href="https://www.linkedin.com/in/wynand-janse-van-rensburg-953539352/" target="_blank" rel="noopener">Wynand Janse van Rensburg</a>'],
          ['timezone', 'UTC+2']
        ]);
        print('');
        print('<span class="c-dim">Tip: run</span> <span class="c-accent">contact copy</span> <span class="c-dim">to copy the email address.</span>');
      },
      complete: () => ['copy']
    },

    stats: {
      desc: 'Live Raspberry Pi telemetry',
      run() {
        const s = window.Site.stats && window.Site.stats.latest;
        if (!s) { print('<span class="c-dim">No telemetry yet, the first poll is still in flight.</span>'); return; }
        const bar = (pct) => {
          const filled = Math.round(Math.max(0, Math.min(100, pct)) / 5);
          return '█'.repeat(filled) + '░'.repeat(20 - filled);
        };
        const cpu = Number(s.cpu_usage) || 0;
        const ram = Number(s.ram_used_pct) || 0;
        const disk = Number(s.disk_root_used_pct) || 0;

        printLines([
          `<span class="c-accent">cpu </span> ${bar(cpu)}  ${cpu.toFixed(1)}%`,
          `<span class="c-accent">ram </span> ${bar(ram)}  ${ram.toFixed(0)}%`,
          `<span class="c-accent">disk</span> ${bar(disk)}  ${disk.toFixed(0)}%`,
          '',
          `<span class="c-dim">temperature</span>  ${s.cpu_temp_c != null ? Number(s.cpu_temp_c).toFixed(1) + '°C' : 'n/a'}`,
          `<span class="c-dim">load avg   </span>  ${Array.isArray(s.load_avg) ? s.load_avg.map((v) => Number(v).toFixed(2)).join('  ') : 'n/a'}`,
          `<span class="c-dim">uptime     </span>  ${window.Site.formatUptime ? window.Site.formatUptime(s.uptime_seconds || 0) : '...'}`,
          `<span class="c-dim">record     </span>  ${window.Site.formatUptime ? window.Site.formatUptime(s.uptime_record_seconds || 0) : '...'}`
        ]);
      }
    },

    weather: {
      desc: 'Current conditions at your location',
      run() {
        const w = window.Site.weather && window.Site.weather.current;
        if (!w) { print('<span class="c-dim">Weather has not resolved yet.</span>'); return; }
        printTable([
          ['conditions', esc(w.label)],
          ['temperature', w.temp + '°C'],
          ['location', esc(w.name || 'unknown')],
          ['effect', esc(w.type || 'none')]
        ]);
      }
    },

    demo: {
      desc: 'Launch a containerised demo: demo [id]',
      complete: () => (window.demoManager ? window.demoManager.list() : []),
      run(args) {
        const ids = window.demoManager ? window.demoManager.list() : [];
        if (!args[0]) {
          print('<span class="c-text">Available demos</span>');
          ids.forEach((id) => print(`  <span class="c-accent">${esc(id)}</span>`));
          print('');
          print('<span class="c-dim">Run</span> <span class="c-accent">demo &lt;id&gt;</span> <span class="c-dim">to boot one.</span>');
          return;
        }
        if (ids.indexOf(args[0]) === -1) { print(`<span class="c-bad">No demo called "${esc(args[0])}".</span>`); return; }
        print(`<span class="c-ok">Starting ${esc(args[0])}…</span>`);
        window.demoManager.start(args[0]);
      }
    },

    theme: {
      desc: 'Switch theme: theme [dark|light]',
      complete: () => ['dark', 'light'],
      run(args) {
        if (!args[0]) { window.Site.toggleTheme(); print(`<span class="c-ok">Theme → ${window.Site.getTheme()}</span>`); return; }
        const t = args[0].toLowerCase();
        if (t !== 'dark' && t !== 'light') { print('<span class="c-bad">Usage: theme [dark|light]</span>'); return; }
        window.Site.setTheme(t, true);
        print(`<span class="c-ok">Theme → ${t}</span>`);
      }
    },

    goto: {
      desc: 'Scroll to a section: goto <section>',
      complete: () => ['home', 'work', 'demo', 'contact'],
      run(args) {
        if (!args[0]) { print('<span class="c-bad">Usage: goto &lt;section&gt;</span>'); return; }
        const id = args[0].toLowerCase();
        if (!document.getElementById(id)) { print(`<span class="c-bad">No section "${esc(id)}".</span>`); return; }
        window.Site.scrollTo('#' + id);
        print(`<span class="c-ok">→ ${esc(id)}</span>`);
      }
    },

    open: {
      desc: 'Open a link: open <github|linkedin|game|source>',
      complete: () => ['github', 'linkedin', 'game', 'source'],
      run(args) {
        const links = {
          github: 'https://github.com/WynandJvR',
          source: 'https://github.com/WynandJvR',
          linkedin: 'https://www.linkedin.com/in/wynand-janse-van-rensburg-953539352/',
          game: '/secret.html'
        };
        const url = links[(args[0] || '').toLowerCase()];
        if (!url) { print('<span class="c-bad">Usage: open &lt;github|linkedin|game|source&gt;</span>'); return; }
        window.open(url, url.charAt(0) === '/' ? '_self' : '_blank', 'noopener');
        print(`<span class="c-ok">Opening ${esc(url)}</span>`);
      }
    },

    neofetch: {
      desc: 'System summary, the traditional way',
      run() {
        const s = window.Site.stats && window.Site.stats.latest;
        const art = [
          '   <span class="c-ok">.~.  .~.</span>',
          '   <span class="c-ok">\\ \\/ /</span>',
          '    <span class="c-ok">\\/\\/</span>',
          '  <span class="c-bad">.-~~~~-.</span>',
          ' <span class="c-bad">( o    o )</span>',
          ' <span class="c-bad">(   \\/   )</span>',
          '  <span class="c-bad">`-.__.-\'</span>'
        ];
        const info = [
          '<span class="c-accent">wynand</span>@<span class="c-accent">portfolio</span>',
          '<span class="c-dim">─────────────────────────</span>',
          `<span class="c-accent">host</span>      Raspberry Pi`,
          `<span class="c-accent">os</span>        Linux`,
          `<span class="c-accent">shell</span>     wynandsh 1.0`,
          `<span class="c-accent">stack</span>     Go · Python · Java · JS`,
          `<span class="c-accent">uptime</span>    ${s && window.Site.formatUptime ? window.Site.formatUptime(s.uptime_seconds || 0) : 'querying…'}`,
          `<span class="c-accent">cpu</span>       ${s ? (Number(s.cpu_usage) || 0).toFixed(1) + '%' : '…'}`,
          `<span class="c-accent">memory</span>    ${s ? Math.round(Number(s.ram_used_pct) || 0) + '%' : '…'}`,
          `<span class="c-accent">theme</span>     ${window.Site.getTheme()}`
        ];
        const rows = Math.max(art.length, info.length);
        for (let i = 0; i < rows; i++) {
          print(`<span style="display:inline-block;width:14ch">${art[i] || ''}</span>${info[i] || ''}`);
        }
      }
    },

    date: {
      desc: 'Current date and time',
      run() {
        const now = new Date();
        print(esc(now.toString()));
        print(`<span class="c-dim">UTC+2:</span> ${esc(now.toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' }))}`);
      }
    },

    echo: { desc: 'Print text back', run(args) { print(esc(args.join(' '))); } },

    history: {
      desc: 'Commands entered this session',
      run() {
        if (!commandHistory.length) { print('<span class="c-dim">Nothing yet.</span>'); return; }
        commandHistory.forEach((c, i) => print(`  <span class="c-dim">${String(i + 1).padStart(3, '\u00a0')}</span>  ${esc(c)}`));
      }
    },

    sudo: {
      desc: 'Elevate privileges (good luck)',
      run(args) {
        if (!args.length) { print('<span class="c-bad">usage: sudo &lt;command&gt;</span>'); return; }
        print(`<span class="c-bad">wynand is not in the sudoers file. This incident has been reported.</span>`);
        print('<span class="c-dim">…to nobody, because this shell only runs in your browser.</span>');
        window.Site.log('[SHELL] sudo attempt: ' + args.join(' '), 'err');
      }
    },

    clear: { desc: 'Clear the screen', run() { outEl.innerHTML = ''; } },

    exit: { desc: 'Close the console', run() { print('<span class="c-dim">Bye.</span>'); setTimeout(closeConsole, 260); } }
  };

  /* -------------------------------------------------------------- Runner */
  function execute(raw) {
    const line = raw.trim();
    print(`<span class="c-accent">wynand@portfolio:~$</span> <span class="c-text">${esc(line)}</span>`);
    if (!line) return;

    commandHistory.push(line);
    historyIndex = -1;

    const parts = line.split(/\s+/);
    const name = parts[0].toLowerCase();
    const args = parts.slice(1);

    // small special case: `contact copy`
    if (name === 'contact' && args[0] === 'copy') {
      window.Site.copyEmail();
      print('<span class="c-ok">Email address copied to clipboard.</span>');
      return;
    }

    const cmd = COMMANDS[name];
    if (!cmd) {
      print(`<span class="c-bad">command not found: ${esc(name)}</span>`);
      const guess = Object.keys(COMMANDS).find((c) => c.indexOf(name.slice(0, 3)) === 0);
      if (guess && name.length >= 2) print(`<span class="c-dim">Did you mean</span> <span class="c-accent">${guess}</span><span class="c-dim">?</span>`);
      else print('<span class="c-dim">Type</span> <span class="c-accent">help</span> <span class="c-dim">for the list.</span>');
      return;
    }

    try {
      cmd.run(args);
    } catch (err) {
      print(`<span class="c-bad">${esc(name)}: ${esc(err.message)}</span>`);
    }
  }

  /* --------------------------------------------------------- Completion */
  function complete() {
    const value = inputEl.value;
    const parts = value.split(/\s+/);

    if (parts.length <= 1) {
      const matches = Object.keys(COMMANDS).filter((c) => c.indexOf(parts[0].toLowerCase()) === 0);
      if (matches.length === 1) inputEl.value = matches[0] + ' ';
      else if (matches.length > 1) {
        print(`<span class="c-accent">wynand@portfolio:~$</span> ${esc(value)}`);
        print('<span class="c-dim">' + matches.join('   ') + '</span>');
        inputEl.value = commonPrefix(matches);
      }
      return;
    }

    const cmd = COMMANDS[parts[0].toLowerCase()];
    if (!cmd || !cmd.complete) return;
    const options = cmd.complete();
    const frag = parts[parts.length - 1].toLowerCase();
    const matches = options.filter((o) => o.indexOf(frag) === 0);
    if (matches.length === 1) {
      parts[parts.length - 1] = matches[0];
      inputEl.value = parts.join(' ') + ' ';
    } else if (matches.length > 1) {
      print('<span class="c-dim">' + matches.join('   ') + '</span>');
      parts[parts.length - 1] = commonPrefix(matches);
      inputEl.value = parts.join(' ');
    }
  }

  function commonPrefix(list) {
    if (!list.length) return '';
    let prefix = list[0];
    list.forEach((s) => {
      while (s.indexOf(prefix) !== 0) prefix = prefix.slice(0, -1);
    });
    return prefix;
  }

  /* ------------------------------------------------------- Open / close */
  function openConsole(tab) {
    if (!consoleEl) return;
    consoleEl.classList.add('is-open');
    setTab(tab || 'shell');
    if ((tab || 'shell') === 'shell') setTimeout(() => inputEl && inputEl.focus(), 120);
  }

  function closeConsole() {
    if (consoleEl) consoleEl.classList.remove('is-open');
  }

  function setTab(name) {
    document.querySelectorAll('.console__tab').forEach((t) => t.classList.toggle('is-active', t.dataset.tab === name));
    document.querySelectorAll('.console__panel').forEach((p) => p.classList.toggle('is-active', p.dataset.panel === name));
    if (name === 'logs') {
      const box = document.getElementById('devLog');
      if (box) box.scrollTop = box.scrollHeight;
    }
  }

  /* --------------------------------------------------------------- Init */
  document.addEventListener('DOMContentLoaded', function () {
    consoleEl = document.getElementById('console');
    outEl = document.getElementById('termOut');
    inputEl = document.getElementById('termInput');
    formEl = document.getElementById('termForm');
    if (!consoleEl || !outEl || !inputEl) return;

    window.Site.openConsole = openConsole;
    window.Site.closeConsole = closeConsole;

    // Banner
    printLines([
      '<span class="c-accent">wynandsh</span> <span class="c-dim">1.0, a real shell running in your browser</span>',
      `<span class="c-dim">Serving from a Raspberry Pi · ${esc(new Date().toDateString())}</span>`,
      '',
      'Type <span class="c-accent">help</span> to see what it can do, or <span class="c-accent">whoami</span> to start.',
      ''
    ]);

    formEl.addEventListener('submit', (e) => {
      e.preventDefault();
      const value = inputEl.value;
      inputEl.value = '';
      execute(value);
    });

    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') { e.preventDefault(); complete(); return; }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!commandHistory.length) return;
        if (historyIndex === -1) { draft = inputEl.value; historyIndex = commandHistory.length; }
        historyIndex = Math.max(0, historyIndex - 1);
        inputEl.value = commandHistory[historyIndex];
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (historyIndex === -1) return;
        historyIndex++;
        if (historyIndex >= commandHistory.length) { historyIndex = -1; inputEl.value = draft; }
        else inputEl.value = commandHistory[historyIndex];
        return;
      }

      if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); outEl.innerHTML = ''; }
      if (e.key === 'c' && e.ctrlKey && !window.getSelection().toString()) {
        e.preventDefault();
        print(`<span class="c-accent">wynand@portfolio:~$</span> ${esc(inputEl.value)}<span class="c-dim">^C</span>`);
        inputEl.value = '';
      }
    });

    // Clicking anywhere in the output focuses the prompt
    outEl.addEventListener('click', () => {
      if (!window.getSelection().toString()) inputEl.focus();
    });

    document.querySelectorAll('.console__tab').forEach((t) => {
      t.addEventListener('click', () => setTab(t.dataset.tab));
    });

    const closeBtn = document.getElementById('consoleClose');
    if (closeBtn) closeBtn.addEventListener('click', closeConsole);

    const consoleBtn = document.getElementById('consoleBtn');
    if (consoleBtn) consoleBtn.addEventListener('click', () => {
      consoleEl.classList.contains('is-open') ? closeConsole() : openConsole('shell');
    });

    const heroBtn = document.getElementById('heroTerminal');
    if (heroBtn) heroBtn.addEventListener('click', () => openConsole('shell'));

    const devBtn = document.getElementById('devConsoleBtn');
    if (devBtn) devBtn.addEventListener('click', () => openConsole('logs'));

    // Ctrl+`  toggles the console
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && (e.key === '`' || e.key === '~')) {
        e.preventDefault();
        consoleEl.classList.contains('is-open') ? closeConsole() : openConsole('shell');
      }
      if (e.key === 'Escape' && consoleEl.classList.contains('is-open') && document.activeElement === inputEl) {
        closeConsole();
      }
    });
  });
})();
