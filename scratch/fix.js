const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'apps/api/src/routes.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Replace req.params.SOMETHING with (req.params.SOMETHING as string)
content = content.replace(/req\.params\.([a-zA-Z]+)/g, '(req.params.$1 as string)');

fs.writeFileSync(filePath, content);
console.log('Fixed req.params in routes.ts');
