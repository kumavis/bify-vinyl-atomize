const test = require('tape')
const browserify = require('browserify')
const endOfStream = require('end-of-stream')
const through = require('through2')
const clone = require('clone')
const vm = require('vm')
const vinylAtomizePlugin = require('../src/index')


test('bundle', (t) => {
  t.plan(1)

  const bundler = browserify({
    plugin: [
      vinylAtomizePlugin,
    ],
  })
  const files = [
    {
      'id': 'entry.js',
      'file': 'entry.js',
      'source': `testResult = require('one')`,
      'deps': {
        'one': 'node_modules/one/index.js'
      },
      'entry': true
    },
    {
      'id': 'node_modules/one/index.js',
      'file': 'node_modules/one/index.js',
      'source': `module.exports = require('two')`,
      'deps': {
        'two': 'node_modules/two/index.js'
      }
    },
    {
      'id': 'node_modules/two/index.js',
      'file': 'node_modules/two/index.js',
      'source': `module.exports = 2`,
      'deps': {}
    }
  ]

  injectFilesIntoBundler(bundler, files)

  const buildStream = bundler.bundle()

  const vinylFiles = []

  // hook for test end/fail
  endOfStream(buildStream, (err) => {
    if (err) return t.fail(err)
    // eval all files and test output
    const result = evalFiles(vinylFiles)
    t.equal(result, 2, 'bundle got expected result')
    t.end()
  })

  buildStream.pipe(through.obj(
    function write (file, _, next) {
      vinylFiles.push(file)
      next()
    }
  ))
})

function injectFilesIntoBundler (bundler, files) {
  // override browserify's module resolution
  const mdeps = bundler.pipeline.get('deps').get(0)
  mdeps.resolve = (id, parent, cb) => {
    const parentModule = files.find(f => f.id === parent.id)
    const moduleId = parentModule ? parentModule.deps[id] : id
    const moduleData = files.find(f => f.id === moduleId)
    if (!moduleData) {
      throw new Error(`could not find "${moduleId}" in files:\n${files.map(f => f.id).join('\n')}`)
    }
    const file = moduleData.file
    const pkg = null
    const fakePath = moduleData.file
    cb(null, file, pkg, fakePath)
  }

  // inject files into browserify pipeline
  const fileInjectionStream = through.obj(null, null, function (cb) {
    clone(files).reverse().forEach(file => {
      // must explicitly specify entry field
      file.entry = file.entry || false
      this.push(file)
    })
    cb()
  })
  bundler.pipeline.splice('record', 0, fileInjectionStream)

  return bundler
}

function evalFiles (files) {
  // create vm context with browser style circular ref
  const context = {}
  context.self = context
  vm.createContext(context)
  // eval each file
  for (const file of files) {
    const code = file.contents.toString('utf8')
    // console.log(`>=== ${file.path}`)
    // console.log(code)
    // console.log(`<=== ${file.path}`)
    vm.runInContext(code, context)
  }
  // pull out test result value from context (not always used)
  return context.testResult
}