var Sequelize = require('sequelize');
var AWS = require('aws-sdk');

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').load();
}

var connection = new Sequelize(process.env.DB_DATABASE, process.env.DB_USERNAME, process.env.DB_PASSWORD, { host: process.env.DB_HOST, dialect: process.env.DB_DIALECT });

connection.sync();

var Dashboard = connection.define('dashboards', {
  guid: {
      type: Sequelize.STRING
  }
});
var Menu = connection.define('menus', {
  title: {
      type: Sequelize.STRING
  },
  url: {
      type: Sequelize.STRING
  },
  dashboardGUID: {
    type: Sequelize.STRING
  }
});
var Card = connection.define('cards', {
  title: {
      type: Sequelize.STRING
  },
  customText: {
      type: Sequelize.TEXT
  },
  backgroundImage: {
      type: Sequelize.STRING
  },
  imageContentType: {
      type: Sequelize.STRING
  }
});
var Day = connection.define('days', {
  date: {
    type: Sequelize.DATE
  }
});
var Item = connection.define('items', {
  title: {
      type: Sequelize.STRING
  },
  nid: {
    type: Sequelize.STRING
  }
});

Dashboard.hasMany(Menu, {
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE',
});
Menu.belongsTo(Dashboard, {
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE',
});
Menu.hasMany(Card, {
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE',
});
Card.belongsTo(Menu, {
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE',
});
Card.hasMany(Day, {
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE',
});
Day.belongsTo(Card, {
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE',
});
Day.hasMany(Item, {
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE',
});
Item.belongsTo(Day, {
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE',
});

module.exports = {
    Dashboard,
    Menu,
    Card,
    Day,
    Item
}