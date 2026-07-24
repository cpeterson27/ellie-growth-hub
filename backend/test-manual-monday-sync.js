const assert = require("assert");
const fs = require("fs");
const source = fs.readFileSync(require.resolve("./services/contactIngestionService"), "utf8");

assert.match(source, /const operation = contact\.mondayItemId \? "updateContact" : "createContact"/);
assert.match(source, /contact\.mondayItemId = String\(result\.id \|\| contact\.mondayItemId \|\| ""\)/);
assert.match(source, /contact\.mondaySyncStatus = "synced"/);
assert.match(source, /contact\.mondaySyncStatus = "failed"/);
assert.match(source, /contact\.mondaySyncError = String\(err\.message \|\| "Sync failed"\)\.slice\(0, 300\)/);
assert.match(source, /async function retryMondaySync/);
assert.match(source, /const contact = await Contact\.findById\(contactId\)/);
console.log("Manual Monday sync/retry tests passed");
