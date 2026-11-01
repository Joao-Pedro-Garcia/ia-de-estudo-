// Valida os arquivos de questões em data/questions/*.json.
// Uso: node scripts/validate-questions.js [arquivo...]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDiscipline, isValidTopic } from '../src/content/curriculum.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, '..', 'data', 'questions');

export function validateQuestion(q) {
  const errs = [];
  const req = ['id', 'discipline', 'topic', 'difficulty', 'type', 'origin', 'statement', 'explanation'];
  for (const k of req) if (q[k] === undefined || q[k] === '') errs.push(`campo obrigatório ausente: ${k}`);
  if (q.discipline && !getDiscipline(q.discipline)) errs.push(`disciplina inválida: ${q.discipline}`);
  if (q.discipline && q.topic && !isValidTopic(q.discipline, q.topic)) errs.push(`tópico inválido: ${q.discipline}/${q.topic}`);
  if (![1, 2, 3, 4].includes(q.difficulty)) errs.push('difficulty deve ser 1..4');
  if (!['multipla_escolha', 'discursiva'].includes(q.type)) errs.push('type inválido');
  if (!['oficial', 'adaptada', 'inedita_ia'].includes(q.origin)) errs.push('origin inválido');
  if ((q.origin === 'oficial' || q.origin === 'adaptada') && !(q.source && q.source.exam && q.source.year)) {
    errs.push('questões oficiais/adaptadas exigem source {exam, year, url}');
  }
  if (q.type === 'multipla_escolha') {
    const alts = q.alternatives || [];
    const keys = alts.map((a) => a.key).join('');
    if (keys !== 'ABCDE') errs.push(`alternativas devem ser A..E (recebido: ${keys})`);
    if (alts.some((a) => !a.text || !String(a.text).trim())) errs.push('alternativa vazia');
    const texts = alts.map((a) => String(a.text).trim().toLowerCase());
    if (new Set(texts).size !== texts.length) errs.push('alternativas duplicadas');
    if (!'ABCDE'.includes(q.answer || '?') || !q.answer) errs.push('answer deve ser A..E');
    if (q.wrong_notes) {
      for (const k of Object.keys(q.wrong_notes)) {
        if (k === q.answer) errs.push('wrong_notes não deve conter a alternativa correta');
      }
    }
  } else if (q.type === 'discursiva') {
    if (!q.expected_answer) errs.push('discursiva exige expected_answer');
  }
  return errs;
}

function main() {
  const files = process.argv.slice(2).length
    ? process.argv.slice(2)
    : fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => path.join(dir, f));
  let total = 0; let bad = 0;
  const ids = new Set();
  const stats = {};
  for (const f of files) {
    let arr;
    try { arr = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { console.error(`${f}: JSON inválido: ${e.message}`); bad++; continue; }
    if (!Array.isArray(arr)) { console.error(`${f}: precisa ser um array`); bad++; continue; }
    for (const q of arr) {
      total++;
      const errs = validateQuestion(q);
      if (ids.has(q.id)) errs.push(`id duplicado: ${q.id}`);
      ids.add(q.id);
      if (errs.length) { bad++; console.error(`${path.basename(f)} ${q.id}: ${errs.join('; ')}`); }
      const k = `${q.discipline}`;
      stats[k] = stats[k] || { total: 0, 1: 0, 2: 0, 3: 0, 4: 0, ans: {} };
      stats[k].total++; stats[k][q.difficulty]++;
      stats[k].ans[q.answer] = (stats[k].ans[q.answer] || 0) + 1;
    }
  }
  for (const [k, s] of Object.entries(stats)) {
    console.log(`${k.padEnd(14)} total=${s.total} n1=${s[1]} n2=${s[2]} n3=${s[3]} n4=${s[4]} gabaritos=${JSON.stringify(s.ans)}`);
  }
  console.log(`\n${total} questões, ${bad} com problemas.`);
  process.exit(bad ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
