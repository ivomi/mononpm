#!/usr/bin/env node

'use strict';

const copydir = require('copy-dir');
const fs = require('fs');
const glob = require('glob');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

const ROOT_DIR = process.cwd() + '/';
const ROOT_PACKAGE = require(process.cwd() + '/package.json');
let debug = false;
let monoPackages = new Map();

async function cmdBuild() {
  monoPackages = loadPackages(ROOT_PACKAGE.packages);
  const queue = getQueue();

  for (const name of queue) {
    const package = monoPackages.get(name);
    console.log('Package:', name);
    updateOptionalDeps(package);
    await installDeps(package);
    await copyDeps(package);
    await buildPackage(package);
  }
}

async function cmdInstall() {
  monoPackages = loadPackages(ROOT_PACKAGE.packages);
  const queue = getQueue();

  for (const name of queue) {
    const package = monoPackages.get(name);
    console.log('Package:', name);
    updateOptionalDeps(package);
    await installDeps(package);
    await copyDeps(package);
  }
}

async function cmdLink() {
  monoPackages = loadPackages(ROOT_PACKAGE.packages);
  const queue = getQueue();

  for (const name of queue) {
    const package = monoPackages.get(name);
    console.log('Package:', name);
    updateOptionalDeps(package);
    await copyDeps(package);
  }
}

async function cmdRun(command) {
  monoPackages = loadPackages(ROOT_PACKAGE.packages);
  const queue = getQueue();

  for (const name of queue) {
    const package = monoPackages.get(name);
    console.log('Package:', name);
    await runPackageCmd(package, command);
  }
}

function loadPackages(packageGlobs) {
  const packageDirs = [];
  for (const pattern of packageGlobs) {
    const paths = glob.sync(pattern);
    packageDirs.push(...paths);
  }

  const packages = new Map();
  for (const dir of packageDirs) {
    const pFile = ROOT_DIR + dir + '/package.json';
    const package = require(pFile);
    packages.set(package.name, { ...package, dir });
  }

  return packages;
}

function getQueue() {
  const queue = [];
  for (const name of monoPackages.keys()) {
    addPackageToQueue(name, queue);
  }
  return Array.from(new Set(queue));
}

function addPackageToQueue(name, queue) {
  const package = monoPackages.get(name);
  const monoDependencies = Object.keys(package.monoDependencies || {});
  for (const dep of monoDependencies) {
    addPackageToQueue(dep, queue);
  }
  queue.push(name);
}

function updateOptionalDeps(package) {
  const optionalDependencies = {};
  getRequiredDeps(package.name, optionalDependencies, package.name);
  package.optionalDependencies = optionalDependencies;

  const path = ROOT_DIR + package.dir + '/package.json';
  fs.writeFileSync(path, JSON.stringify(package, null, 2));
}

function getRequiredDeps(name, optionalDependencies, rootName) {
  const package = monoPackages.get(name);
  const monoDependencies = Object.keys(package.monoDependencies || {});
  for (const dep of monoDependencies) {
    getRequiredDeps(dep, optionalDependencies);
  }
  if (name === rootName) { return; }
  for (const [dep, version] of Object.entries(package.dependencies)) {
    optionalDependencies[dep] = version;
  }
}

async function installDeps(package) {
  console.log('>> npm install');
  const cwd = ROOT_DIR + package.dir;
  try {
    const { stdout } = await exec('npm install --no-audit', { cwd });
    if (debug) { console.log(stdout); }
  } catch (error) {
    console.log(error.stdout);
    process.exit(1);
  }
}

async function copyDeps(package) {
  console.log('>> link');
  const monoDeps = getMonoDepsForPackage(package);
  for (const dep of monoDeps) {
    const depPackage = monoPackages.get(dep);
    copyDepPackage(package, depPackage);
    copyDepPackageJson(package, depPackage);
  }
}

function copyDepPackage(package, depPackage) {
  const from = ROOT_DIR + depPackage.dir + '/dist';
  const to = ROOT_DIR + package.dir + '/node_modules/' + depPackage.name;
  fs.mkdirSync(to, { recursive: true });
  copydir.sync(from, to, { utimes: true, mode: true });
}

function copyDepPackageJson(package, depPackage) {
  const from = ROOT_DIR + depPackage.dir + '/package.json';
  const to = ROOT_DIR + package.dir + '/node_modules/' + depPackage.name + '/package.json';
  fs.copyFileSync(from, to);
}

async function buildPackage(package) {
  console.log('>> build');
  const cwd = ROOT_DIR + package.dir;
  try {
    const { stdout } = await exec('npm run build', { cwd });
    if (debug) { console.log(stdout); }
  } catch(error) {
    console.log(error.stdout);
    process.exit(1);
  }
}

function getMonoDepsForPackage(package) {
  const mono = [];
  const monoDependencies = Object.keys(package.monoDependencies || {});
  for (const dep of monoDependencies) {
    addMonoPackage(dep, mono);
  }
  return Array.from(new Set(mono));
}

function addMonoPackage(name, mono) {
  const package = monoPackages.get(name);
  const monoDependencies = Object.keys(package.monoDependencies || {});
  for (const dep of monoDependencies) {
    addMonoPackage(dep, mono);
  }
  mono.push(name);
}

async function runPackageCmd(package, command) {
  console.log('>> npm run ' + command);
  const cwd = ROOT_DIR + package.dir;
  try {
    const { stdout } = await exec('npm run ' + command, { cwd });
    console.log(stdout);
  } catch (error) {
    console.log(error.stdout);
    process.exit(1);
  }
}

async function run() {
  const command = process.argv[2];
  debug = !!process.argv[3];

  if (command === 'build') {
    await cmdBuild();
  } else if (command === 'install') {
    await cmdInstall();
  } else if (command === 'link') {
    await cmdLink();
  } else if (command === 'run') {
    await cmdRun(process.argv[3]);
  } else {
    console.log('Unknown command: ' + command);
  }
}

run();
