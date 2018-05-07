var Sequelize = require('sequelize');
var connection = require('../sequelize.js');
var Card = connection.import(__dirname + "/Card.js");


module.exports = (sequelize, DataTypes) => {
    var Item = sequelize.define('items', {
        data: {
            type: DataTypes.TEXT
        }
    });
    Item.belongsTo(Card, {
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
    });
    return Item;
}