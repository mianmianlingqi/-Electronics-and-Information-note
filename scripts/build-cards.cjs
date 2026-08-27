const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const QUIZ_DIR = path.join(ROOT, '背诵速记', '填空卷');

const SUBJECTS = [
  {
    id: 'circuit',
    prefix: 'c',
    title: '电路分析',
    short: '电路',
    quiz: '01-电路分析填空卷.md',
    answers: '01-电路分析填空卷-答案.md',
    moduleAnchor: 'circuit'
  },
  {
    id: 'analog',
    prefix: 'a',
    title: '模拟电子技术',
    short: '模电',
    quiz: '02-模拟电子技术填空卷.md',
    answers: '02-模拟电子技术填空卷-答案.md',
    moduleAnchor: 'analog'
  },
  {
    id: 'digital',
    prefix: 'd',
    title: '数字电子技术',
    short: '数电',
    quiz: '03-数字电子技术填空卷.md',
    answers: '03-数字电子技术填空卷-答案.md',
    moduleAnchor: 'digital'
  }
];

function parseAnswers(text) {
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^(\d+)\.\s*(.+)$/);
    if (m) map.set(Number(m[1]), m[2].trim());
  }
  return map;
}

function extractChapterRef(title) {
  const m = title.match(/第(\d+[A-Za-z]?)章/);
  return m ? m[1].toLowerCase() : null;
}

function slugify(text) {
  return text
    .replace(/^#+\s*/, '')
    .replace(/[（(].*$/, '')
    .trim()
    .slice(0, 40);
}

function blankCount(text) {
  const underscores = (text.match(/_{2,}/g) || []).length;
  if (underscores) return underscores;
  return 1;
}

function promptToHtml(text) {
  let html = text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/_{2,}/g, '<span class="blank">______</span>');
  return html;
}

function splitAnswers(raw, count) {
  if (!raw) return [''];
  const parts = raw.split(/[；;、|/]|(?:\s+-\s+)/).map(s => s.trim()).filter(Boolean);
  if (parts.length >= count) return parts.slice(0, count);
  if (count === 1) return [raw];
  if (parts.length === 1 && count > 1) {
    const alt = raw.split(/\s{2,}/).map(s => s.trim()).filter(Boolean);
    if (alt.length >= count) return alt.slice(0, count);
  }
  while (parts.length < count) parts.push('');
  return parts;
}

function parseQuizFile(subject, quizText, answerMap) {
  const chapters = [];
  const cards = [];
  let currentChapter = null;
  let chapterIndex = 0;

  for (const line of quizText.split(/\r?\n/)) {
    const section = line.match(/^##\s+(.+)$/);
    if (section) {
      chapterIndex += 1;
      const title = section[1].trim();
      const chapterRef = extractChapterRef(title);
      currentChapter = {
        id: `${subject.id}-${chapterIndex}`,
        subjectId: subject.id,
        title,
        chapterRef,
        readAnchor: chapterRef ? `${subject.prefix}${chapterRef}` : subject.moduleAnchor,
        count: 0
      };
      chapters.push(currentChapter);
      continue;
    }

    const q = line.match(/^(\d+)\.\s+(.+)$/);
    if (!q || !currentChapter) continue;

    const num = Number(q[1]);
    const prompt = q[2].trim();
    const blanks = blankCount(prompt);
    const answerRaw = answerMap.get(num) || '';
    const answers = splitAnswers(answerRaw, blanks);
    const must = /\*\*|🔴|必背|高频/.test(prompt);

    const card = {
      id: `${subject.id}-${String(num).padStart(3, '0')}`,
      subjectId: subject.id,
      chapterId: currentChapter.id,
      num,
      prompt,
      promptHtml: promptToHtml(prompt),
      answers,
      answerText: answerRaw,
      blankCount: blanks,
      must,
      readAnchor: currentChapter.readAnchor
    };

    cards.push(card);
    currentChapter.count += 1;
  }

  return { chapters, cards };
}

function buildCards() {
  const subjects = SUBJECTS.map(s => ({
    id: s.id,
    prefix: s.prefix,
    title: s.title,
    short: s.short,
    moduleAnchor: s.moduleAnchor
  }));

  const chapters = [];
  const cards = [];

  for (const subject of SUBJECTS) {
    const quizPath = path.join(QUIZ_DIR, subject.quiz);
    const ansPath = path.join(QUIZ_DIR, subject.answers);
    const quizText = fs.readFileSync(quizPath, 'utf8');
    const ansText = fs.readFileSync(ansPath, 'utf8');
    const answerMap = parseAnswers(ansText);
    const parsed = parseQuizFile(subject, quizText, answerMap);
    chapters.push(...parsed.chapters);
    cards.push(...parsed.cards);
  }

  for (const s of subjects) {
    s.count = cards.filter(c => c.subjectId === s.id).length;
  }

  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    total: cards.length,
    subjects,
    chapters,
    cards
  };

  const outPath = path.join(ROOT, 'cards.json');
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`Built cards.json — ${cards.length} cards (${subjects.map(s => `${s.short} ${s.count}`).join(', ')})`);
  return payload;
}

if (require.main === module) buildCards();

module.exports = { buildCards, SUBJECTS };
