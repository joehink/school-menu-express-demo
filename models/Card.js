// var mongoose = require('mongoose');
// var Schema = mongoose.Schema;

// var cardSchema = new Schema({
//     menu: { type: mongoose.Schema.Types.ObjectId, ref: 'Menu'},
//     title: String,
//     backgroundImage: String,
//     items: [],
//     imageContentType: String
// });

// //Display URL virtual
// cardSchema.virtual('displayURL').get(function () {
//     return '/card/' + this._id;
//   });

// module.exports = mongoose.model('Card', cardSchema);
var connection = require('../sequelize.js');
var Item = connection.import(__dirname + "/Item.js");
var Card = connection.import(__dirname + "/Card.js");

module.exports = (sequelize, DataTypes) => {
    var Card = sequelize.define('cards', {
        title: {
            type: DataTypes.STRING
        },
        backgroundImage: {
            type: DataTypes.STRING
        },
        imageContentType: {
            type: DataTypes.STRING
        }
    });
    Card.belongsTo(Menu, {
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
    });
    Card.hasMany(Item, {
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
    });
    return Card;
  }