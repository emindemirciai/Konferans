const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../apps/api/src/routes.ts');
let lines = fs.readFileSync(file, 'utf8').split('\n');

let currentRoute = "";
for(let i=0; i<lines.length; i++) {
  let line = lines[i];
  if(line.includes("router.")) {
    let match = line.match(/router\.[a-z]+\('([^']+)'/);
    if(match) currentRoute = match[1];
  }
  
  while(line.includes('(req.params. as string)')) {
    let param = "";
    if (currentRoute.includes(':serverId') && !currentRoute.includes(':memberId')) param = "serverId";
    else if (currentRoute.includes(':channelId')) param = "channelId";
    else if (currentRoute.includes(':messageId')) param = "messageId";
    else if (currentRoute.includes(':requestId')) param = "requestId";
    else if (currentRoute.includes(':notificationId')) param = "notificationId";
    else if (currentRoute.includes(':subscriptionId')) param = "subscriptionId";
    else if (currentRoute.includes(':token')) param = "token";
    else if (currentRoute.includes(':userId')) param = "userId";
    else if (currentRoute.includes(':memberId')) {
       if (line.includes('requireServerMember') || line.includes('target.serverId') || line.includes('logAudit') || line.includes('serverId: ')) {
           param = "serverId";
       } else {
           param = "memberId";
       }
    }
    
    if (line.includes('where: { serverId_userId: { serverId: (req.params. as string)')) param = "serverId";
    
    if (!param) {
        console.log("Could not fix line", i, line);
        process.exit(1);
    }
    line = line.replace('(req.params. as string)', `(req.params.${param} as string)`);
  }
  lines[i] = line;
}

fs.writeFileSync(file, lines.join('\n'));
console.log('Fixed routes.ts');
