#!/usr/bin/env node
// Public bundle check (MASTER_PLAN C-21): public pages of the built playground
// must not load Admin, Editor, Tiptap or admin CSS.
//
// Starts the production server from playground/.output, takes the HTML of each
// public route, collects the assets it references (scripts, modulepreload,
// stylesheet and prefetch links) and follows static JS imports recursively.
// Dynamic import() is not followed: it loads only when the code asks for it.
// Every collected file is searched for the markers below.
//
// Limitation: a lazy import that a public page runs unconditionally
// (`<ClientOnly><LazyX/>`, `defineAsyncComponent`, `import()` in onMounted) is
// not seen here. Edit Mode (008) adds such a branch, so its DoD also checks
// the requested chunks of `/` in the browser.
//
// Usage: npm run build && npm run check:bundle

import { spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join, posix, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT = join(ROOT, 'playground', '.output')
const SERVER_ENTRY = join(OUTPUT, 'server', 'index.mjs')
const PUBLIC_DIR = join(OUTPUT, 'public')
const ASSETS_DIR = join(PUBLIC_DIR, '_nuxt')

// 014: the blog list and posts (one with its own Ukrainian address).
const PUBLIC_ROUTES = ['/', '/about', '/blog', '/blog/calm-interfaces', '/uk/blog/spokiini-interfeisy', '/careers']
const SERVER_START_TIMEOUT_MS = 20_000

// `expected`: the marker must occur somewhere in the client build outside the
// public graph. Otherwise the check would pass because the marker is stale.
const MARKERS = [
  { name: 'admin root class', pattern: 'cms-admin', expected: true },
  { name: 'admin CSS tokens', pattern: '--cms-', expected: true },
  { name: 'admin locale cookie', pattern: 'cms_locale', expected: true },
  { name: 'admin dictionary (en)', pattern: 'Content Management System', expected: true },
  { name: 'admin dictionary (uk)', pattern: 'Система керування', expected: true },
  { name: 'vee-validate', pattern: 'validateOnBlur', expected: true },
  { name: 'admin shell', pattern: 'AdminShell', expected: true },
  { name: 'session Supabase client', pattern: 'createBrowserClient', expected: true },
  { name: 'cms_users table', pattern: 'cms_users', expected: true },
  { name: 'Tiptap', pattern: 'tiptap', ignoreCase: true, expected: true },
  { name: 'ProseMirror', pattern: 'prosemirror', ignoreCase: true, expected: true },
  // Edit Mode (008). The editable branches load through import(), which this
  // script does not follow; these markers catch a static import by mistake.
  { name: 'editor overlay', pattern: 'data-cms-overlay', expected: true },
  { name: 'editor runtime guard', pattern: 'must run inside Edit Mode', expected: true },
  { name: 'editor UI class', pattern: 'cms-editor-ui', expected: true },
  // 014: the registry of content types (#cms/content) is for the admin only.
  { name: 'content registry (#cms/content)', pattern: 'Blog posts', expected: true },
  // Core's form of a Content type declared with `fields` (C-103), and the
  // date picker it uses (@vuepic/vue-datepicker).
  { name: 'entry form renderer', pattern: 'entry-form-field', expected: true },
  { name: 'date picker', pattern: 'dp--theme-light', expected: true },
]

function fail(message) {
  console.error(`check:bundle: ${message}`)
  process.exitCode = 1
}

// The entry lists the files of every lazy chunk for dynamic imports
// (`__vite__mapDeps`), e.g. "./AdminShell.DMA16ITY.css". A file name is not
// loaded code, so asset path literals are dropped before the search.
const ASSET_PATH_LITERAL = /(["'])(?:\.{1,2}\/|\/_nuxt\/)[\w.-]+\.(?:js|css)\1/g

function findMarkers(content) {
  const code = content.replace(ASSET_PATH_LITERAL, '""')
  const lower = code.toLowerCase()

  return MARKERS.filter(({ pattern, ignoreCase }) =>
    ignoreCase ? lower.includes(pattern.toLowerCase()) : code.includes(pattern))
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer()

    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolvePort(port))
    })
  })
}

async function waitForServer(baseUrl, child) {
  const deadline = Date.now() + SERVER_START_TIMEOUT_MS

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`server exited with code ${child.exitCode}`)
    }

    try {
      await fetch(baseUrl)
      return
    }
    catch {
      await new Promise(resolveDelay => setTimeout(resolveDelay, 200))
    }
  }

  throw new Error(`server did not start within ${SERVER_START_TIMEOUT_MS} ms`)
}

/** `/_nuxt/…` asset URLs referenced by the HTML of one page. */
function assetUrlsFromHtml(html) {
  const urls = new Set()

  for (const [, src] of html.matchAll(/<script\b[^>]*\ssrc="([^"]+)"/g)) {
    urls.add(src)
  }

  for (const [tag] of html.matchAll(/<link\b[^>]*>/g)) {
    const rel = /\srel="([^"]+)"/.exec(tag)?.[1]
    const href = /\shref="([^"]+)"/.exec(tag)?.[1]

    if (href && rel && /\b(?:modulepreload|stylesheet|prefetch|preload)\b/.test(rel)) {
      urls.add(href)
    }
  }

  return [...urls].filter(url => url.startsWith('/_nuxt/')).map(url => url.split(/[?#]/)[0])
}

/** `<script type="importmap">` of the page: bare specifier → URL (Nuxt maps `#entry`). */
function importMapFromHtml(html) {
  const json = /<script\b[^>]*\stype="importmap"[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1]

  if (!json) {
    return {}
  }

  try {
    return JSON.parse(json).imports ?? {}
  }
  catch {
    fail('the page has an importmap that is not valid JSON')
    return {}
  }
}

/** Specifiers of static imports: `import "x"`, `from "x"`; not `import("x")`. */
function staticImports(code) {
  return [...code.matchAll(/(?:\bfrom|\bimport)\s*["']([^"'\s]+)["']/g)].map(match => match[1])
}

/**
 * Asset path a static import of `fromAsset` points to, or null when it is not
 * a client asset. Bare specifiers resolve only through the importmap: other
 * matches are text inside strings, e.g. `import '@supabase/supabase-js/tracing'`
 * in a warning message.
 */
function resolveImport(fromAsset, specifier, importMap) {
  const target = Object.hasOwn(importMap, specifier) ? importMap[specifier] : specifier

  if (target.startsWith('./') || target.startsWith('../')) {
    return target.endsWith('.js') ? posix.join(posix.dirname(fromAsset), target) : null
  }

  return target.startsWith('/_nuxt/') && target.endsWith('.js') ? target.slice(1) : null
}

/** Public asset paths (relative to PUBLIC_DIR, posix) reachable from the page HTML. */
function collectGraph(html) {
  const graph = new Set()
  const importMap = importMapFromHtml(html)
  const queue = assetUrlsFromHtml(html).map(url => url.slice(1))

  while (queue.length > 0) {
    const asset = queue.pop()

    if (graph.has(asset)) {
      continue
    }

    const file = join(PUBLIC_DIR, asset)

    if (!existsSync(file)) {
      fail(`referenced asset is missing: /${asset}`)
      continue
    }

    graph.add(asset)

    if (asset.endsWith('.js')) {
      for (const specifier of staticImports(readFileSync(file, 'utf8'))) {
        const imported = resolveImport(asset, specifier, importMap)

        if (imported) {
          queue.push(imported)
        }
      }
    }
  }

  return graph
}

async function checkRoutes(baseUrl) {
  const publicAssets = new Set()

  for (const route of PUBLIC_ROUTES) {
    const response = await fetch(new URL(route, baseUrl))
    const html = await response.text()

    // An error page carries no page chunk, so its graph would pass vacuously.
    if (!response.ok) {
      fail(`${route} responded with HTTP ${response.status}; the check needs the real page`)
      continue
    }

    const graph = collectGraph(html)
    const violations = []

    for (const marker of findMarkers(html)) {
      violations.push(`${route} (HTML) → ${marker.name} ("${marker.pattern}")`)
    }

    for (const asset of graph) {
      publicAssets.add(asset)

      for (const marker of findMarkers(readFileSync(join(PUBLIC_DIR, asset), 'utf8'))) {
        violations.push(`/${asset} → ${marker.name} ("${marker.pattern}")`)
      }
    }

    if (violations.length > 0) {
      fail(`${route} loads code that must stay out of the public runtime:\n  ${violations.join('\n  ')}`)
    }
    else {
      console.log(`check:bundle: ${route} OK (${graph.size} assets)`)
    }
  }

  return publicAssets
}

/** Every expected marker must still exist in some non-public client file. */
function checkMarkersAreLive(publicAssets) {
  const found = new Set()

  for (const name of readdirSync(ASSETS_DIR, { recursive: true })) {
    const asset = posix.join('_nuxt', String(name).split('\\').join('/'))

    if (publicAssets.has(asset) || !/\.(?:js|css)$/.test(asset)) {
      continue
    }

    for (const marker of findMarkers(readFileSync(join(PUBLIC_DIR, asset), 'utf8'))) {
      found.add(marker)
    }
  }

  const stale = MARKERS.filter(marker => marker.expected && !found.has(marker))

  if (stale.length > 0) {
    fail(`markers not found in any admin chunk, the check may be stale: ${stale.map(marker => `"${marker.pattern}"`).join(', ')}`)
  }
}

async function main() {
  if (!existsSync(SERVER_ENTRY)) {
    fail(`${relative(ROOT, SERVER_ENTRY)} not found. Run "npm run build" first.`)
    return
  }

  const port = await freePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const server = spawn(process.execPath, [SERVER_ENTRY], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), NITRO_HOST: '127.0.0.1', NITRO_PORT: String(port) },
    stdio: ['ignore', 'ignore', 'inherit'],
  })

  try {
    await waitForServer(baseUrl, server)
    const publicAssets = await checkRoutes(baseUrl)
    checkMarkersAreLive(publicAssets)
  }
  finally {
    server.kill()
  }

  if (!process.exitCode) {
    console.log('check:bundle: public runtime is free of Admin / Editor code')
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error))
})
