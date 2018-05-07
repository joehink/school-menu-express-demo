var connection = require('../sequelize.js');
var Menu = connection.import(__dirname + "/Menu.js");
module.exports = (sequelize, DataTypes) => {
    var Dashboard = sequelize.define('dashboards', {
        guid: {
            type: DataTypes.STRING
        }
    });
    Dashboard.hasMany(Menu, {
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
    });
    return Dashboard;
  }