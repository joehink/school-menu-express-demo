// var mongoose = require('mongoose');

// var menuSchema = mongoose.Schema({
//     dashboardGUID: String,
//     title: String,
//     url: String,
//     cards: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Card' }]
// });

// module.exports = mongoose.model('Menu', menuSchema);
var connection = require('../sequelize.js');
var Card = connection.import(__dirname + "/Card.js");
var Dashboard = connection.import(__dirname + "/Dashboard.js");

module.exports = (sequelize, DataTypes) => {
    var Menu = sequelize.define('menus', {
        title: {
            type: DataTypes.STRING
        },
        url: {
            type: DataTypes.STRING
        }
    });
    Menu.belongsTo(Dashboard, {
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
    });
    Menu.hasMany(Card, {
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
    });
    return Menu;
  }