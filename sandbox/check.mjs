import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const TEMPLATE = path.join(HERE, 'template')
const require = createRequire(path.join(TEMPLATE, 'package.json'))
const { chromium } = require('playwright')

const [componentPath, assertionsArg = '[]'] = process.argv.slice(2)
if (!componentPath) {
  console.error('usage: node sandbox/check.mjs <component.tsx> <assertions-json>')
  process.exit(1)
}
const assertions = JSON.parse(assertionsArg)

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: 120000 })
  return { ok: r.status === 0, log: (r.stdout || '') + (r.stderr || '') }
}

function serve(dir) {
  const types = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
  }
  const root = path.resolve(dir)
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0])
    if (p === '/') p = '/index.html'
    const file = path.join(root, p)
    if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404)
      return res.end()
    }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' })
    fs.createReadStream(file).pipe(res)
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

const result = {
  build: false,
  lint: false,
  render: false,
  console_errors: [],
  assertions: {},
  passed: false,
}
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'webgen-'))

try {
  fs.cpSync(TEMPLATE, work, {
    recursive: true,
    filter: (src) => {
      const top = path.relative(TEMPLATE, src).split(path.sep)[0]
      return top !== 'node_modules' && top !== 'dist'
    },
  })
  fs.symlinkSync(path.join(TEMPLATE, 'node_modules'), path.join(work, 'node_modules'))
  fs.copyFileSync(path.resolve(componentPath), path.join(work, 'src', 'App.tsx'))

  const build = run('npm', ['run', 'build'], work)
  result.build = build.ok
  if (!build.ok) result.build_log = build.log.slice(-1500)

  const pkg = JSON.parse(fs.readFileSync(path.join(work, 'package.json'), 'utf8'))
  if (pkg.scripts && pkg.scripts.lint) result.lint = run('npm', ['run', 'lint'], work).ok

  if (build.ok) {
    const server = await serve(path.join(work, 'dist'))
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage()
      page.on('console', (m) => {
        if (m.type() === 'error') result.console_errors.push(m.text())
      })
      page.on('pageerror', (e) => result.console_errors.push(String(e)))
      await page.goto('http://127.0.0.1:' + server.address().port, { waitUntil: 'networkidle' })
      const info = await page.evaluate(() => {
        const root = document.getElementById('root')
        return {
          elements: root ? root.querySelectorAll('*').length : 0,
          text: root ? root.innerText.trim().length : 0,
        }
      })
      result.render = result.console_errors.length === 0 && info.elements > 0 && info.text > 0
      for (const sel of assertions) {
        result.assertions[sel] = (await page.locator(sel).count()) > 0
      }
    } finally {
      await browser.close()
      server.close()
    }
  }
  result.passed = result.build && result.render && Object.values(result.assertions).every(Boolean)
} finally {
  fs.rmSync(work, { recursive: true, force: true })
}

console.log(JSON.stringify(result, null, 2))
