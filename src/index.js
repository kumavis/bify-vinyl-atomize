/*
TODO:
- [x] add modified prelude
  - should export prelude's "outer" on to global
- [x] wrap each module
  - should registed the module via the exported global "outer"
- [x] execute bundle at end
- [ ] util for summary of files (e.g. to put in manifest or html)
*/

const fs = require('fs')
const through = require('through2')
const Vinyl = require('vinyl')
const combineSourceMap = require('combine-source-map')
const stringify = require('json-stable-stringify')

const preludeSource = fs.readFileSync(require.resolve('browser-pack/_prelude.js'), 'utf8')
const moduleRegistrarSource = fs.readFileSync(__dirname + '/setupModuleRegistrar.js', 'utf8')

module.exports = setupPlugin


function setupPlugin (browserify, pluginOpts) {
  // setup the plugin in a re-bundle friendly way
  browserify.on('reset', () => plugin(browserify, pluginOpts))
  plugin(browserify, pluginOpts)
}

function plugin (browserify, pluginOpts) {
  const customPack = createVinylPacker(pluginOpts)
  replacePacker(browserify, customPack)
}

function replacePacker (browserify, customPack) {
  // pipeline.splice does not re-label inserted streams
  customPack.label = 'pack'
  // replace the standard browser-pack with our custom packer
  browserify.pipeline.splice('pack', 1, customPack)
}

function createVinylPacker () {
  const entryIds = []
  const packer = createPacker({
    onStart () {
      const bundleInitSource = `(${moduleRegistrarSource})(${preludeSource})`
      const moduleRegistrar = new Vinyl({
        path: '__0-bundle-init.js',
        contents: Buffer.from(bundleInitSource, 'utf8'),
      })
      return moduleRegistrar
    },
    onEach (moduleData) {
      // check if entry module
      if (moduleData.entry) {
        entryIds.push(moduleData.id)
      }
      // wrap source in module register call
      const registerSource = createSourceForModuleRegister(moduleData)
      // deliver as vinyl file
      const file = new Vinyl({
        path: moduleData.file,
        contents: Buffer.from(registerSource, 'utf8'),
      })
      return file
    },
    onEnd () {
      const bundleRunnerSource = `runBundle(${JSON.stringify(entryIds)})`
      const file = new Vinyl({
        path: '__1-bundle-start.js',
        contents: Buffer.from(bundleRunnerSource, 'utf8'),
      })
      return file
    },
  })

  return packer
}

function createPacker ({ onStart, onEach, onEnd }) {
  const packer = through.obj(write, end)

  const firstFile = onStart()
  packer.push(firstFile)

  return packer


  function write (data, _, next) {
    const newFile = onEach(data)
    packer.push(newFile)
    next()
  }

  function end(cb) {
    const lastFile = onEnd()
    packer.push(lastFile)
    cb()
  }
}

function createSourceForModuleRegister (moduleData) {
  const moduleSource = combineSourceMap.removeComments(moduleData.source)
  const moduleDeps = moduleData.deps || {}
  return (
`registerModule(${JSON.stringify(moduleData.id)}, [
function(require,module,exports){
${moduleSource}
},${stringify(moduleDeps)}])`
  )
}
