const { execSync } = require('child_process');
const key = process.env.MONDAY_API_KEY;
const result = execSync(`curl -s -i -X POST https://api.monday.com/graphql -H "Content-Type: application/json" -H "Authorization: ${key}" -d '{"query": "{ me { id name email } }"}'`);
console.log(result.toString());
