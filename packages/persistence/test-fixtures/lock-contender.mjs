// Cross-process lock fixture (AI-IMP-016): tries to open the project
// directory given as argv[2] and reports the outcome on stdout.
const dir = process.argv[2]
const { openProject, ProjectLockedError } = await import('../dist/index.js')

try {
  const handle = openProject(dir)
  console.log('OPENED')
  handle.close()
  process.exit(0)
} catch (err) {
  if (err instanceof ProjectLockedError) {
    console.log(`LOCKED pid=${err.holder.pid}`)
    process.exit(3)
  }
  console.log(`ERROR ${err?.message ?? err}`)
  process.exit(1)
}
