const mongoose = require("mongoose");

function connectDatabase(uri) {
  return mongoose.connect(uri)
}

module.exports = { connectDatabase };
