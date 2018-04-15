var mongoose = require('mongoose');

var cardSchema = mongoose.Schema({
    menu: { type: mongoose.Schema.Types.ObjectId, ref: 'Menu'},
    title: String,
    backgroundImage: String,
    items: []
});

module.exports = mongoose.model('Card', cardSchema);