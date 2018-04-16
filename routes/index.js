var express = require('express');
var router = express.Router();
var async = require('async');

var Menu = require('../models/Menu');
var Card = require('../models/Card');
var Dashboard = require('../models/Dashboard');
var SampleLunch = require('../models/SampleLunch');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.send('Put in your url');
});

// GET dashboard // Create dashboard if does not exist
router.get('/dashboard/:dashboardGUID', function(req, res, next) {
  //try to find dashboard based off of req.params.dashboardGUID
  Dashboard.findOne({dashboardGUID: req.params.dashboardGUID}, function(err, dashboard) {
    if (err) { return next(err);}
      if (!dashboard) {
        console.log('is null')
        //CREATE dashboard if one does not exist with supplied dashboardGUID
        Dashboard.create({dashboardGUID: req.params.dashboardGUID}, function(err, dashboard) {
          if (err) throw err;
          res.redirect(`/dashboard/${dashboard.dashboardGUID}`);
        });
      } else {
        //GET dashboard with menus
        Menu.find({dashboardGUID: req.params.dashboardGUID}, function(err, menus) {
          if (err) {return next(err);}
          
          res.render('index', { dashboard: req.params.dashboardGUID, menus: menus });
        });
      }
    });
});

//CREATE menu 
router.post('/dashboard/:dashboardGUID/menu/create', function(req, res, next) {
  Menu.create({
    title: req.body.menuTitle, 
    url: req.body.healtheUrl,
    dashboardGUID: req.params.dashboardGUID
  }, function(err, menu) {
    if (err) throw err;
    //Add new menu to Dashboard Object
    Dashboard.findOne({dashboardGUID: req.params.dashboardGUID}, function(err, dashboard) {
      console.log(dashboard);
      dashboard.menus.push(menu._id);
      dashboard.save(function(err, dashboard) {
        res.redirect(`/dashboard/${req.params.dashboardGUID}`);
      })
    });
  });
});

//GET menu deatails
router.get('/menu/:menuId', function(req, res, next) {
  Menu.findById(req.params.menuId)
  .populate('cards')
  .exec(function(err, menu) {
      if (err) {return next(err);}
      var items = [];
      menu.cards.forEach((card) => {
        card.items.forEach((item) => {
          items.push(JSON.parse(item))
        });
        card.items = items;
        items = [];
      });

      console.log(items);
      res.render('menuDetail', {cards: menu.cards, menu: menu, host: req.headers.host});
  });
})

//GET create card form
router.get('/menu/:menuId/card/create', function(req, res, next) {
  // Menu.findById(req.params.menuId, function (err, menu) {
  //   //make fetch to menu.url and render lunch items to the form 
  // });
  
  //Replace this with above ^^^^^
  SampleLunch.find({}, function(err, lunches) {
    res.render('createCard', {menuId: req.params.menuId, lunches: lunches});
  })
});

//CREATE new card
router.post('/menu/:menuId/card/create', function(req, res, next) {
  Card.create({
    menu: req.params.menuId,
    title: req.body.cardTitle,
    items: req.body.selectedItem
  }, function(err, card) {
    if (err) throw err;
    //add new card to Menu object
    Menu.findById(req.params.menuId, function(err, menu) {
      menu.cards.push(card._id);
      menu.save(function(err, data) {
        if (err) throw err;
        res.redirect(`/menu/${req.params.menuId}`);
      });
    });
  });
});
    







//CREATE SAMPLE LUNCHES
router.post('/create-sample-lunch', function(req, res, next) {
  SampleLunch.create({
    title: req.body.title,
    image: req.body.image,
    description: req.body.description,
    allergens: [req.body.allergens],
    attributes: [req.body.attributes],
    servingSize: req.body.servingSize,
    servingSizeMeasurement: req.body.servingSizeMeasurement,
    ingredientInfo: req.body.ingredientInfo,
    nutrients: {
        calories: req.body.calories,
        fat_total: req.body.fat_total,
        saturated_fat: req.body.saturated_fat,
        trans_fat: req.body.trans_fat,
        cholesterol: req.body.cholesterol,
        sodium: req.body.sodium,
        carbohydrates: req.body.carbohydrates,
        fiber: req.body.fiber,
        sugar: req.body.sugar,
        protein: req.body.protein,
        iron: req.body.iron,
        calcium: req.body.calcium,
        vitamin_a_iu: req.body.vitamin_a_iu,
        vitamin_c: req.body.vitamin_c,
        ash: req.body.ash,
        serving_weight: req.body.serving_weight,
        ash_data_missing: req.body.ash_data_missing,
        calcium_measurement: req.body.calcium_measurement,
        iron_measurement: req.body.iron_measurement,
        vitamin_a_iu_measurement: req.body.vitamin_a_iu_measurement,
        vitamin_c_measurement: req.body.vitamin_c_measurement
    }
  }, function(err, sampleLunch) {
    if (err) throw err;
    res.send('hey');
  })
});

module.exports = router;
