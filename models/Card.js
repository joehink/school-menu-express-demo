var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var cardSchema = new Schema({
    menu: { type: mongoose.Schema.Types.ObjectId, ref: 'Menu'},
    title: String,
    backgroundImage: String,
    items: [],
    imageContentType: String
});

//Display URL virtual
cardSchema.virtual('displayURL').get(function () {
    return '/card/' + this._id;
  });

module.exports = mongoose.model('Card', cardSchema);