function setupModuleRegistrar (bundleInitFn) {
  const modules = {}
  const requireFn = bundleInitFn(modules, {}, [])
  // export bundle APIs onto global
  registerModule = (moduleId, moduleData) => { modules[moduleId] = moduleData }
  runBundle = (entries) => { for (const moduleId of entries) requireFn(moduleId) }
}