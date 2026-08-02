const assert = require("node:assert/strict");
const { compileWithRules, parseNumber } = require("./services/marketResearchService");

assert.equal(parseNumber("2.5k"), 2500);
const plan = compileWithRules("Find hair salons in San Francisco with 2+ locations");
assert.deepEqual(plan.criteria.locations, ["San Francisco"]);
assert.equal(plan.criteria.minimumLocations, 2);
assert.match(plan.criteria.industries[0], /Hair Salons/i);
assert.equal(plan.compiler, "rules");

const employees = compileWithRules("Find property managers in Texas with 10-100 employees");
assert.deepEqual(employees.criteria.employeeRange, { min: 10, max: 100 });

console.log("Market research query compiler tests passed");
