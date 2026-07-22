import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parse } = require('@babel/parser');
const root = process.cwd();
const failures = [];

const fail = (message) => {
  failures.push(message);
  console.error(`FAIL  ${message}`);
};
const pass = (message) => console.log(`PASS  ${message}`);

function collectJavaScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectJavaScriptFiles(fullPath);
    return entry.isFile() && /\.(js|jsx|mjs)$/.test(entry.name) ? [fullPath] : [];
  });
}

function parseFile(file) {
  return parse(fs.readFileSync(file, 'utf8'), {
    sourceType: 'unambiguous',
    plugins: ['jsx'],
  });
}

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'start', 'end'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach((child) => walk(child, visit));
    else walk(value, visit);
  }
}

function repositoryMethods(file, variableName) {
  let methods;
  walk(parseFile(file), (node) => {
    if (
      node.type === 'VariableDeclarator' &&
      node.id?.name === variableName &&
      node.init?.type === 'ObjectExpression'
    ) {
      methods = node.init.properties
        .map((property) => property.key?.name ?? property.key?.value)
        .filter(Boolean)
        .sort();
    }
  });
  if (!methods) throw new Error(`Could not find ${variableName}`);
  return methods;
}

const sourceFiles = [
  ...collectJavaScriptFiles(path.join(root, 'src')),
  ...['App.js', 'index.js', 'app.config.js', 'babel.config.js'].map((file) => path.join(root, file)),
];

let syntaxFailed = false;
for (const file of sourceFiles) {
  try {
    parseFile(file);
  } catch (error) {
    syntaxFailed = true;
    fail(`${path.relative(root, file)} has invalid syntax: ${error.message}`);
  }
}
if (!syntaxFailed) pass(`Parsed ${sourceFiles.length} JavaScript files`);

for (const repoName of ['folderRepo', 'noteRepo']) {
  const nativeFile = path.join(root, 'src', 'db', `${repoName}.js`);
  const webFile = path.join(root, 'src', 'db', `${repoName}.web.js`);
  try {
    const nativeMethods = repositoryMethods(nativeFile, repoName);
    const webMethods = repositoryMethods(webFile, repoName);
    if (JSON.stringify(nativeMethods) !== JSON.stringify(webMethods)) {
      fail(`${repoName} API differs between native and web\n  native: ${nativeMethods.join(', ')}\n  web:    ${webMethods.join(', ')}`);
    } else {
      pass(`${repoName} native/web APIs match (${nativeMethods.length} methods)`);
    }
  } catch (error) {
    fail(`${repoName} contract check failed: ${error.message}`);
  }
}

if (failures.length) {
  console.error(`\nVerification failed with ${failures.length} error(s).`);
  process.exit(1);
}

console.log('\nLockNote verification passed.');
