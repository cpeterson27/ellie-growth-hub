const assert = require("assert");
const fs = require("fs");
const source = fs.readFileSync(require.resolve("./routes/contacts"), "utf8");
const model = fs.readFileSync(require.resolve("./models/Contact"), "utf8");
const adapter = fs.readFileSync(require.resolve("./services/integrations/MondayAdapter"), "utf8");

assert.match(model, /"archived"/);
assert.match(source, /status: \{ \$ne: "archived" \}/);
assert.match(source, /router\.post\("\/:id\/archive"/);
assert.match(source, /await retryMondaySync\(contact\._id\)/);
assert.match(source, /Outreach\.countDocuments\(\{ contactId: req\.params\.id \}\)/);
assert.match(source, /outreachCount && !req\.body\?\.confirmCascade/);
assert.match(source, /archiveContact/);
assert.match(adapter, /async archiveContact/);
const archiveBeforeDelete = source.indexOf('"archiveContact"') < source.indexOf("await contactService.deleteContact");
assert(archiveBeforeDelete, "Monday archival must happen before MongoDB deletion");
console.log("Contact archive/delete safeguard tests passed");
