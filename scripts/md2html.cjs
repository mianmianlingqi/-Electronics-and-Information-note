const fs = require('fs');
const path = require('path');

const SITE_BASE = '/-Electronics-and-Information-note';
const MODULES_ROOT = path.join(__dirname, '..', '背诵速记');

const MODULES = [
  { file: '01-电路分析背诵速记.md', id: 'circuit', prefix: 'c', title: '电路分析', num: '01', weight: '第1～8章' },
  { file: '02-模拟电子技术背诵速记.md', id: 'analog', prefix: 'a', title: '模拟电子技术', num: '02', weight: '二极管/BJT/运放' },
  { file: '03-数字电子技术背诵速记.md', id: 'digital', prefix: 'd', title: '数字电子技术', num: '03', weight: '逻辑/组合/时序' }
];

function inline(text) {
  return text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function isEmojiCard(header) {
  return /🔴|📖|📐/.test(header);
}

function cardClass(header) {
  if (/🔴|📐/.test(header)) return 'card must';
  if (/📖/.test(header)) return 'card def';
  if (/了解|选做/.test(header)) return 'card tip';
  return 'card';
}

function cardLabel(header) {
  return header.replace(/🔴\s*|📖\s*|📐\s*/g, '').trim();
}

function resolveImage(src) {
  if (/^https?:\/\//.test(src)) return src;
  const clean = src.replace(/^\.\//, '');
  return `${SITE_BASE}/背诵速记/${clean}`;
}

function isTableLine(line) {
  return line.trim().startsWith('|');
}

function parseTable(lines, start) {
  let i = start;
  const rows = [];
  while (i < lines.length && isTableLine(lines[i])) {
    const row = lines[i]
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map(c => c.trim());
    if (!row.every(c => /^[-:\s]+$/.test(c))) rows.push(row);
    i++;
  }
  if (!rows.length) return { html: '', next: start };

  const [head, ...body] = rows;
  let html = '<table class="table"><thead><tr>';
  head.forEach(c => { html += `<th>${inline(c)}</th>`; });
  html += '</tr></thead><tbody>';
  body.forEach(row => {
    html += '<tr>';
    row.forEach(c => { html += `<td>${inline(c)}</td>`; });
    html += '</tr>';
  });
  html += '</tbody></table>';
  return { html, next: i };
}

function parseList(lines, start, endAt) {
  const ordered = /^\d+\.\s/.test(lines[start]);
  const tag = ordered ? 'ol' : 'ul';
  const cls = ordered ? 'steps' : 'plain';
  let i = start;
  let html = `<${tag} class="${cls}">`;
  while (i < lines.length && i < endAt) {
    const m = lines[i].match(ordered ? /^(\d+)\.\s+(.*)/ : /^-\s+(.*)/);
    if (!m) break;
    html += `<li>${inline(m[ordered ? 2 : 1])}</li>`;
    i++;
  }
  html += `</${tag}>`;
  return { html, next: i };
}

function parseMathBlock(lines, start) {
  let i = start;
  let line = lines[i].trim();
  if (line.startsWith('$$') && line.endsWith('$$') && line.length > 4) {
    return { html: `<div class="formula">${line}</div>`, next: i + 1 };
  }
  let tex = line.replace(/^\$\$/, '');
  i++;
  while (i < lines.length && !lines[i].includes('$$')) {
    tex += `\n${lines[i]}`;
    i++;
  }
  if (i < lines.length) tex += `\n${lines[i].replace(/\$\$.*$/, '')}`;
  return { html: `<div class="formula">$$${tex.trim()}$$</div>`, next: i + 1 };
}

function parseCodeBlock(lines, start) {
  let i = start + 1;
  const body = [];
  while (i < lines.length && !lines[i].startsWith('```')) {
    body.push(lines[i]);
    i++;
  }
  const code = body.join('\n')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return { html: `<pre class="code-wall">${code}</pre>`, next: i + 1 };
}

function parseCardBody(lines, start, endAt) {
  let i = start;
  let html = '';
  while (i < lines.length && i < endAt) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (/^#{2,4}\s/.test(line)) break;
    if (line.startsWith('>') || line.startsWith('- [ ]')) { i++; continue; }
    if (line.trim() === '---') { i++; continue; }

    const img = line.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
    if (img) {
      html += `<figure class="figure"><img src="${resolveImage(img[2])}" alt="${img[1]}" loading="lazy"><figcaption>${img[1]}</figcaption></figure>`;
      i++;
      continue;
    }
    if (line.trim().startsWith('```')) {
      const block = parseCodeBlock(lines, i);
      html += block.html;
      i = block.next;
      continue;
    }
    if (line.trim().startsWith('$$')) {
      const block = parseMathBlock(lines, i);
      html += block.html;
      i = block.next;
      continue;
    }
    if (isTableLine(line)) {
      const table = parseTable(lines, i);
      html += table.html;
      i = table.next;
      continue;
    }
    if (/^-\s/.test(line) || /^\d+\.\s/.test(line)) {
      const list = parseList(lines, i, endAt);
      html += list.html;
      i = list.next;
      continue;
    }

    html += `<p>${inline(line)}</p>`;
    i++;
  }
  return { html, next: i };
}

function sectionEnd(lines, start, skipHeader = false) {
  const from = skipHeader ? start + 1 : start;
  for (let i = from; i < lines.length; i++) {
    if (lines[i].startsWith('## ')) return i;
  }
  return lines.length;
}

function renderCard(lines, i, end) {
  const header = lines[i].replace(/^#{3,4}\s+/, '');
  const cls = cardClass(header);
  const label = cardLabel(header);
  i++;
  const body = parseCardBody(lines, i, end);
  return {
    html: `<div class="${cls}"><p class="card-label">${label}</p>${body.html}</div>`,
    next: body.next
  };
}

function parseChapter(lines, start, prefix, chNum, chTitle) {
  const end = sectionEnd(lines, start);
  let i = start;
  let html = `<section class="block" id="${prefix}${chNum}"><h2>第${chNum}章 · ${chTitle}</h2>`;

  while (i < end) {
    const line = lines[i];
    if (!line.trim() || line.trim() === '---') { i++; continue; }

    if (line.startsWith('#### ')) {
      const card = renderCard(lines, i, end);
      html += card.html;
      i = card.next;
      continue;
    }

    if (line.startsWith('### ')) {
      const header = line.replace(/^###\s+/, '');
      if (isEmojiCard(header)) {
        const card = renderCard(lines, i, end);
        html += card.html;
        i = card.next;
      } else {
        html += `<h3 class="subsection">${header}</h3>`;
        i++;
      }
      continue;
    }

    if (isTableLine(line)) {
      const table = parseTable(lines, i);
      html += table.html;
      i = table.next;
      continue;
    }

    const img = line.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
    if (img) {
      html += `<figure class="figure"><img src="${resolveImage(img[2])}" alt="${img[1]}" loading="lazy"><figcaption>${img[1]}</figcaption></figure>`;
      i++;
      continue;
    }

    if (line.trim().startsWith('$$')) {
      const block = parseMathBlock(lines, i);
      html += block.html;
      i = block.next;
      continue;
    }

    if (/^-\s/.test(line) || /^\d+\.\s/.test(line)) {
      const list = parseList(lines, i, end);
      html += list.html;
      i = list.next;
      continue;
    }

    if (line.startsWith('**')) {
      html += `<p>${inline(line)}</p>`;
      i++;
      continue;
    }

    i++;
  }

  html += '</section>';
  return { html, next: end };
}

function parseCompareSection(lines, start, prefix, title) {
  const end = sectionEnd(lines, start, true);
  let i = start + 1;
  let html = `<section class="block" id="${prefix}-compare"><h2>${title.replace(/^##\s+/, '')}</h2>`;
  while (i < end) {
    if (isTableLine(lines[i])) {
      const table = parseTable(lines, i);
      html += table.html;
      i = table.next;
    } else {
      i++;
    }
  }
  html += '</section>';
  return { html, next: end };
}

function parseFlowSection(lines, start, prefix, title) {
  const end = sectionEnd(lines, start, true);
  let i = start + 1;
  let html = `<section class="block" id="${prefix}-flow"><h2>${title.replace(/^##\s+/, '')}</h2><div class="flow-grid">`;

  while (i < end) {
    const line = lines[i];
    if (line.startsWith('### ') || line.startsWith('#### ')) {
      const hdr = line.replace(/^#{3,4}\s+/, '');
      i++;
      const body = parseCardBody(lines, i, end);
      i = body.next;
      html += `<div class="card flow"><h3>${hdr}</h3>${body.html}</div>`;
      continue;
    }
    if (line.startsWith('**')) {
      html += `<div class="card flow"><p>${inline(line)}</p></div>`;
      i++;
      continue;
    }
    if (line.startsWith('>')) { i++; continue; }
    i++;
  }

  html += '</div></section>';
  return { html, next: end };
}

function parseFormulaWall(lines, start, prefix, title) {
  const end = sectionEnd(lines, start, true);
  let i = start + 1;
  let html = `<section class="block" id="${prefix}-formulas"><h2>${title.replace(/^##\s+/, '')}</h2>`;
  const body = parseCardBody(lines, i, end);
  html += `<div class="card must">${body.html}</div></section>`;
  return { html, next: end };
}

function mdToModuleHtml(md, mod) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  let lead = '口诀 → 公式 → 步骤 → 易混。考前通读，重点默写必背块。';
  for (const line of lines) {
    if (line.startsWith('>') && !line.includes('来源：')) {
      lead = line.replace(/^>\s*/, '').trim();
      break;
    }
  }

  let html = `<header class="module-hero" id="${mod.id}">`;
  html += `<p class="eyebrow">模块 ${mod.num} · ${mod.weight}</p>`;
  html += `<h1>${mod.title}</h1>`;
  html += `<p class="lead">${lead}</p></header>`;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('## 第') && line.includes('章')) {
      const m = line.match(/## 第(\d+)章\s+(.+)/);
      if (m) {
        const block = parseChapter(lines, i + 1, mod.prefix, m[1], m[2]);
        html += block.html;
        i = block.next;
        continue;
      }
    }

    if (line.startsWith('## ') && /易混/.test(line)) {
      const block = parseCompareSection(lines, i, mod.prefix, line);
      html += block.html;
      i = block.next;
      continue;
    }

    if (line.startsWith('## ') && /(大题|步骤)/.test(line)) {
      const block = parseFlowSection(lines, i, mod.prefix, line);
      html += block.html;
      i = block.next;
      continue;
    }

    if (line.startsWith('## ') && /(公式|速查)/.test(line)) {
      const block = parseFormulaWall(lines, i, mod.prefix, line);
      html += block.html;
      i = block.next;
      continue;
    }

    i++;
  }

  return html;
}

function buildToc() {
  let toc = '';
  for (const mod of MODULES) {
    toc += `<p class="toc-group">${mod.title}</p>`;
    toc += `<a href="#${mod.id}">概览</a>`;

    const md = fs.readFileSync(path.join(MODULES_ROOT, mod.file), 'utf8');
    for (const line of md.split('\n')) {
      const ch = line.match(/^## 第(\d+)章\s+(.+)/);
      if (ch) {
        const short = ch[2].length > 8 ? ch[2].slice(0, 8) : ch[2];
        toc += `<a href="#${mod.prefix}${ch[1]}">第${ch[1]}章 ${short}</a>`;
      }
      if (/## .*易混/.test(line)) toc += `<a href="#${mod.prefix}-compare">易混对比</a>`;
      if (/## .*(大题|步骤)/.test(line)) toc += `<a href="#${mod.prefix}-flow">大题流程</a>`;
      if (/## .*(公式|速查)/.test(line)) toc += `<a href="#${mod.prefix}-formulas">公式速查</a>`;
    }
  }
  return toc;
}

function buildAllModules() {
  return MODULES.map(mod => {
    const md = fs.readFileSync(path.join(MODULES_ROOT, mod.file), 'utf8');
    return mdToModuleHtml(md, mod);
  });
}

function buildPageShell(toc, content) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="description" content="电子信息 · 电路/模电/数电知识点速览">
  <title>电子信息知识点速览</title>
</head>
<body>
  <a class="skip" href="#content">跳到正文</a>

  <header class="mobile-bar">
    <button class="menu-btn" type="button" id="menuBtn" aria-label="打开目录" aria-expanded="false" aria-controls="sidebar">☰</button>
    <strong>电子信息速览</strong>
  </header>
  <div class="sidebar-backdrop" id="sidebarBackdrop" hidden></div>

  <aside class="sidebar" id="sidebar">
    <div class="sidebar-brand">
      <span class="mark">⚡</span>
      <div>
        <strong>电子信息速览</strong>
        <span>电路 · 模电 · 数电</span>
      </div>
    </div>
    <nav class="toc" aria-label="目录">
${toc}
    </nav>
    <p class="sidebar-foot">
      <a href="quiz.html">✍️ 填空练习</a><br>
      <a href="https://github.com/mianmianlingqi/-Electronics-and-Information-note">GitHub</a>
    </p>
  </aside>

  <div class="page">
    <article class="content" id="content">
${content}
    </article>

    <footer class="footer">
      配合
      <a href="https://github.com/mianmianlingqi/-Electronics-and-Information-note/tree/main/背诵速记">背诵速记</a>
      使用 · 2026 暑期讲义
    </footer>
  </div>

  <script>
  (function () {
    var btn = document.getElementById('menuBtn');
    var backdrop = document.getElementById('sidebarBackdrop');
    if (!btn) return;
    function setOpen(open) {
      document.body.classList.toggle('nav-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.setAttribute('aria-label', open ? '关闭目录' : '打开目录');
      if (backdrop) backdrop.hidden = !open;
    }
    btn.addEventListener('click', function () {
      setOpen(!document.body.classList.contains('nav-open'));
    });
    if (backdrop) backdrop.addEventListener('click', function () { setOpen(false); });
    document.querySelectorAll('.toc a').forEach(function (a) {
      a.addEventListener('click', function () { setOpen(false); });
    });
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setOpen(false);
    });
  })();
  </script>
</body>
</html>`;
}

module.exports = {
  MODULES,
  SITE_BASE,
  MODULES_ROOT,
  mdToModuleHtml,
  buildToc,
  buildAllModules,
  buildPageShell
};
