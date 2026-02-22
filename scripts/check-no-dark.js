import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const rootDir = process.cwd()
const ALLOWED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.css', '.html', '.json'])
const IGNORE_DIRS = new Set(['.git', 'node_modules', 'dist', 'coverage'])
const IGNORE_FILES = new Set(['scripts/check-no-dark.js'])

const FORBIDDEN_PATTERNS = [
  { name: 'dark: variant', regex: /dark:/g },
  { name: "classList.add('dark')", regex: /classList\.add\(\s*['\"]dark['\"]\s*\)/g },
  { name: 'data-theme="dark"', regex: /data-theme\s*=\s*['\"]dark['\"]/g },
  { name: 'prefers-color-scheme: dark', regex: /prefers-color-scheme\s*:\s*dark/g },
  { name: 'bg-black', regex: /bg-black/g },
  { name: 'bg-neutral-9', regex: /bg-neutral-9/g },
  { name: 'bg-slate-9', regex: /bg-slate-9/g },
  { name: 'bg-zinc-9', regex: /bg-zinc-9/g },
  { name: '.dark { block', regex: /\.dark\s*\{/g },
]

function walk(dir) {
  const entries = readdirSync(dir)
  const files = []

  for (const entry of entries) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)

    if (stat.isDirectory()) {
      if (!IGNORE_DIRS.has(entry)) {
        files.push(...walk(fullPath))
      }
      continue
    }

    const extension = entry.slice(entry.lastIndexOf('.'))
    if (ALLOWED_EXTENSIONS.has(extension)) {
      files.push(fullPath)
    }
  }

  return files
}

const violations = []
for (const file of walk(rootDir)) {
  const content = readFileSync(file, 'utf8')
  const relativePath = relative(rootDir, file)
  if (IGNORE_FILES.has(relativePath)) {
    continue
  }

  for (const { name, regex } of FORBIDDEN_PATTERNS) {
    for (const match of content.matchAll(regex)) {
      violations.push(`${relativePath}: "${name}" -> ${match[0]}`)
    }
  }
}

if (violations.length > 0) {
  console.error('❌ Dark mode patterns detected:\n')
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  process.exit(1)
}

console.log('✅ No forbidden dark mode patterns detected.')
