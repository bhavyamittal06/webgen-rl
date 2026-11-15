import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const [samplesPath, promptsPath, outPath] = process.argv.slice(2)
if (!samplesPath || !promptsPath || !outPath) {
  console.error('usage: node eval/score.mjs <samples.jsonl> <prompts.jsonl> <results.jsonl>')
  process.exit(1)
}

const readJsonl = (p) =>
  fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const prompts = Object.fromEntries(readJsonl(promptsPath).map((p) => [p.id, p]))
const samples = readJsonl(samplesPath)

fs.mkdirSync(path.dirname(outPath), { recursive: true })
const out = fs.openSync(outPath, 'w')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'score-'))
const rows = []

samples.forEach((s, i) => {
  const p = prompts[s.id]
  if (!p) return
  const file = path.join(tmp, `${s.id}_${s.sample}.tsx`)
  fs.writeFileSync(file, s.code)
  const r = spawnSync(
    'node',
    [path.join(ROOT, 'sandbox/check.mjs'), file, JSON.stringify(p.assertions)],
    { encoding: 'utf8', timeout: 300000 },
  )
  let res
  try {
    res = JSON.parse(r.stdout)
  } catch {
    res = {
      build: false, lint: false, render: false, console_errors: [],
      assertions: {}, passed: false, error: (r.stderr || '').slice(-500),
    }
  }
  const row = { id: s.id, sample: s.sample, category: p.category, ...res }
  rows.push(row)
  fs.writeSync(out, JSON.stringify(row) + '\n')
  console.log(`[${i + 1}/${samples.length}] ${s.id}#${s.sample} ${row.passed ? 'PASS' : 'FAIL'}${row.build ? '' : ' (build)'}`)
})

const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) + '%' : '-')
function summarize(label, rs) {
  const n = rs.length
  const c = (f) => rs.filter(f).length
  console.log(
    label.padEnd(14), String(n).padStart(3),
    'build', pct(c((r) => r.build), n).padStart(6),
    'render', pct(c((r) => r.render), n).padStart(6),
    'pass', pct(c((r) => r.passed), n).padStart(6),
  )
}
console.log('')
summarize('OVERALL', rows)
for (const cat of [...new Set(rows.map((r) => r.category))]) {
  summarize(cat, rows.filter((r) => r.category === cat))
}
const byPrompt = {}
for (const r of rows) (byPrompt[r.id] ??= []).push(r)
const anyPass = Object.values(byPrompt).filter((rs) => rs.some((r) => r.passed)).length
console.log(`\nprompts with at least one passing sample: ${anyPass}/${Object.keys(byPrompt).length}`)
