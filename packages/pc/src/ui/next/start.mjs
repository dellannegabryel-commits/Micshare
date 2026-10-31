import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const nextPath = require.resolve('next');
console.log('Next.js resolved at:', nextPath);