const assert = require("assert");
const fs = require("fs");
const source = fs.readFileSync(require.resolve("./routes/contacts"), "utf8");
const model = fs.readFileSync(require.resolve("./models/Contact"), "utf8");

assert.match(model, /"archived"/);
assert.match(source, /status: \{ \$ne: "archived" \}/);
assert.match(source, /router\.post\("\/:id\/archive"/);
assert.match(source, /Outreach\.countDocuments\(\{ contactId: req\.params\.id \}\)/);
assert.match(source, /outreachCount && !req\.body\?\.confirmCascade/);
console.log("Contact archive/delete safeguard tests passed");
