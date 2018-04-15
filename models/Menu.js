var mongoose = require('mongoose');

var menuSchema = mongoose.Schema({
    dashboardGUID: String,
    title: String,
    url: String,
    cards: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Card' }]
});

module.exports = mongoose.model('Menu', menuSchema);