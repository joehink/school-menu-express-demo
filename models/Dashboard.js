var mongoose = require('mongoose');

var dashboardSchema = mongoose.Schema({
    dashboardGUID: String,
    menus: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Menu'}]
});

module.exports = mongoose.model('Dashboard', dashboardSchema);