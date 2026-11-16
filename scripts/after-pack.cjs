const { execFileSync } = require('node:child_process')
const path = require('node:path')

// electron-builder skips signing when no Developer ID certificate is available.
// An unsigned repacked bundle is reported as "damaged" on Apple Silicon, so use
// an ad-hoc signature to make the bundle structurally valid. Users will still
// need to allow the unnotarized app on first launch.
module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  )

  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
    stdio: 'inherit',
  })
}
