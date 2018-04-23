var express = require('express');
var router = express.Router();
var async = require('async');
var AWS = require('aws-sdk');
var multiparty = require('multiparty');
var fs = require('fs');

var Menu = require('../models/Menu');
var Card = require('../models/Card');
var Dashboard = require('../models/Dashboard');
var SampleLunch = require('../models/SampleLunch');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.send('Put in your url');
});

// GET dashboard // Create dashboard if does not exist
router.get('/dashboard/:dashboardGUID', async function(req, res, next) {
  try {
    //TRY TO FIND DASHBOARD BASED OFF OF REQ.PARAMS.DASHBOURDGUID
    var dashboard = await Dashboard.findOne({dashboardGUID: req.params.dashboardGUID});

    if (!dashboard) {
      //CREATE A NEW DASHBOARD
      Dashboard.create({dashboardGUID: req.params.dashboardGUID}, function(err, dashboard) {
        if (err) throw err;
        res.redirect(`/dashboard/${dashboard.dashboardGUID}`);
      });
    } else {
      //FIND MENUS THAT BELONG TO THIS DASHBOARD
      Menu.find({dashboardGUID: req.params.dashboardGUID}, function(err, menus) {
        if (err) {return next(err);}
        //RENDER DASHBOARD PAGE
        res.render('index', { dashboard: req.params.dashboardGUID, menus: menus });
      });
    }
  } catch(err) {
    console.error(err);
  }
});

//CREATE menu 
router.post('/dashboard/:dashboardGUID/menu/create', async function(req, res, next) {
  try {
    //CREATE NEW MENU
    var menu = await Menu.create({
      title: req.body.menuTitle, 
      url: req.body.healtheUrl,
      dashboardGUID: req.params.dashboardGUID
    });

    //ADD MENU TO DASHBOARD OBJECT IN DATABASE
    var dashboard = await Dashboard.findOne({dashboardGUID: req.params.dashboardGUID});
    dashboard.menus.push(menu._id);
    await dashboard.save();

    //RENDER DASHBOARD
    res.redirect(`/dashboard/${req.params.dashboardGUID}`);

  } catch(err) {
    console.error(err);
  }
});

//GET menu deatails
router.get('/menu/:menuId', function(req, res, next) {
  Menu.findById(req.params.menuId)
  .populate('cards')
  .exec(function(err, menu) {
      if (err) {return next(err);}
      res.render('menuDetail', {cards: menu.cards, menu: menu, host: req.headers.host});
  });
})

//DELETE menu
router.get('/menu/:menuId/delete', function(req, res, next) {
  Card.remove({menu: req.params.menuId}, function(err) {
    if (err) throw err;
    Menu.findByIdAndRemove(req.params.menuId, function(err, menu) {
      res.redirect(`/dashboard/${menu.dashboardGUID}`);
    })
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
router.post('/menu/:menuId/card/create', async function(req, res, next) {
  var form = new multiparty.Form();
  async.waterfall([
    function(callback) {
      //PARSE MULTIPART FORM WITH MULTIPARTY PACKAGE
      form.parse(req, function(err, fields, files) {
        //PARSE EACH ITEM FROM FORM INTO OBJECT 
        var items = [];
        fields.selectedItem.forEach((item) => {
          items.push(JSON.parse(item))
        });
        if (err) {
          throw err;
        } else {
          callback(null, fields, files, items);
        }
      });
    },
    function(fields, files, items, callback) {
      //CREATE A NEW CARD IN THE DATABASE
      Card.create({
        menu: req.params.menuId,
        title: fields.cardTitle,
        items: items,
        backgroundImage: files.backgroundImage[0].originalFilename,
        imageContentType: files.backgroundImage[0].headers['content-type']
      }, function(err, card) {
        if (err) {
          throw err;
        } else {
          callback(null, files, card);
        }
      });
    },
    function(files, card, callback) {
      //ADD NEW CARD TO MENU OBJECT IN DATABASE
      Menu.findById(req.params.menuId, function(err, menu) {
        menu.cards.push(card._id);
        menu.save(function(err, newMenu) {
          if (err) {
            throw err;
          } else {
            callback(null, files, card);
          }
        });
      });
    },
    function(files, card, callback) {
      //UPLOAD BACKGROUND IMAGE TO S3 BUCKET
      var s3 = new AWS.S3();
      var params = {
        Bucket: 'school-menu-bucket',
        Key: card._id.toString(),
        Body: fs.createReadStream(files.backgroundImage[0].path)
      };
      s3.upload(params, function(err, data) {
        if (err) {
          throw err;
        } else {
          fs.unlink(files.backgroundImage[0].path);
          callback(null);
        }
      });
    }
  ], function(err) {
      res.redirect(`/menu/${req.params.menuId}`);
  });
});

//GET card
router.get('/card/:cardId', async function(req, res, next) {
  //FIND CARD BY ID
  var card = await Card.findById(req.params.cardId);

  //GET IMAGE FROM S3 BUCKET
  var s3 = new AWS.S3();
  var params = {
    Bucket: "school-menu-bucket", 
    Key: card._id.toString()
  };
  s3.getObject(params, function(err, data) {
    if (err) console.log(err, err.stack); // an error occurred
    else {
    var imageFromS3 = (new Buffer(data.Body)).toString('base64');
    res.render('viewCard', {bgImage: imageFromS3, card: card, contentType: card.imageContentType});
    }
  });
});

//DELETE card
router.get('/card/:cardId/delete', function(req, res, next) {
  Card.findByIdAndRemove(req.params.cardId, function(err, card) {
    res.redirect(`/menu/${card.menu}`);
  });
});

//GET edit form
  router.get('/card/:cardId/edit', function(req, res, next) {
    async.parallel({
      lunches: function(callback) {
        SampleLunch.find({}).exec(callback);
      },
      card: function(callback) {
        Card.findById(req.params.cardId).exec(callback);
      },
  }, function(err, results) {
      if (err) { return next(err); }
      var s3 = new AWS.S3();
      var params = {
        Bucket: "school-menu-bucket", 
        Key: results.card._id.toString()
       };
       s3.getObject(params, function(err, data) {
         if (err) console.log(err, err.stack); // an error occurred
         else {
          var imageFromS3 = (new Buffer(data.Body)).toString('base64');
          res.render('editCard', {bgImage: imageFromS3, card: results.card, contentType: results.card.imageContentType, lunches: results.lunches});
         }
       });
    });
  });

  //EDIT card
  router.post('/card/:cardId/edit', function(req, res, next) {
    var form = new multiparty.Form();
    var items = [];

    form.parse(req, async function(err, fields, files) {
      await fields.selectedItem.forEach((item) => {
        items.push(JSON.parse(item))
      });
      var fieldsToUpdate = {
        title: fields.cardTitle,
        items: items
      };
      if (files.backgroundImage[0].size != 0) {
        fieldsToUpdate.backgroundImage = files.backgroundImage[0].originalFilename;
        fieldsToUpdate.imageContentType = files.backgroundImage[0].headers['content-type'];
      }
      await Card.findByIdAndUpdate(req.params.cardId, fieldsToUpdate, function(err, card) {
        items = [];
        if (err) throw err;
        if (files.backgroundImage[0].size != 0) {
          var s3 = new AWS.S3();
          var params = {
            Bucket: 'school-menu-bucket',
            Key: card._id.toString(),
            Body: fs.createReadStream(files.backgroundImage[0].path)
          }
          s3.upload(params, function(err, data) {
            res.redirect(`/menu/${card.menu}`);
          })
        } else {
          res.redirect(`/menu/${card.menu}`);
        }
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
