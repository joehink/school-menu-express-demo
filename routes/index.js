var express = require('express');
var router = express.Router();
var async = require('async');
var AWS = require('aws-sdk');
var multiparty = require('multiparty');
var fs = require('fs');
var createDOMPurify = require('dompurify');
var { JSDOM } = require('jsdom');
var window = (new JSDOM('')).window;
var DOMPurify = createDOMPurify(window);

var Menu = require('../models/Menu');
var Card = require('../models/Card');
var Dashboard = require('../models/Dashboard');
var SampleLunch = require('../models/SampleLunch');

function removeFrameguard (req, res, next) {
  res.removeHeader('X-Frame-Options');
  next();
}

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
      //CREATE A NEW DASHBOARD IF NONE MATCH GUID
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
      title: DOMPurify.sanitize(req.body.menuTitle), 
      url: DOMPurify.sanitize(req.body.healtheUrl),
      dashboardGUID: DOMPurify.sanitize(req.params.dashboardGUID)
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
      if (!menu) {
        res.render('notFound', {menuId: req.params.menuId});
      } else {
        res.render('menuDetail', {cards: menu.cards, menu: menu, host: req.headers.host});
      }
  });
})

//DELETE menu
router.get('/menu/:menuId/delete', async function(req, res, next) {
  try {
    //DELETE MENU BY ID
    var menu = await Menu.findByIdAndRemove(req.params.menuId);

    //LOOP THROUGH EACH CARD ID IN DELETED MENU OBJECT
    await menu.cards.forEach(async (cardId) => {

      //REMOVE CARD BY ID
      await Card.findByIdAndRemove(cardId);

      //DELETE PHOTOS ASSOCIATED WITH EACH CARD 
      var s3 = new AWS.S3();
      var params = {
        Bucket: "school-menu-bucket", 
        Key: cardId.toString()
      };
      s3.deleteObject(params, function(err, data) {
        if (err) console.log(err, err.stack);
      });
    })

    //REDIRECT TO DASHBOARD
    res.redirect(`/dashboard/${menu.dashboardGUID}`);

  } catch(err) {
    console.error(err)
    res.render('notFound', {menuId: req.params.menuId});
  }
});  

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
  var form = new multiparty.Form();

  //PARSE MULTIPART FORM WITH MULTIPARTY PACKAGE
  form.parse(req, async function(err, fields, files) {
    try {
      //PARSE EACH ITEM FROM FORM INTO OBJECT 
      var items = [];
      await fields.selectedItem.forEach((item) => {
        items.push(JSON.parse(item))
      });

      //CREATE A NEW CARD IN THE DATABASE
      var card = await Card.create({
        menu: DOMPurify.sanitize(req.params.menuId),
        title: DOMPurify.sanitize(fields.cardTitle),
        items: items,
        backgroundImage: DOMPurify.sanitize(files.backgroundImage[0].originalFilename),
        imageContentType: DOMPurify.sanitize(files.backgroundImage[0].headers['content-type'])
      });

      //ADD NEW CARD TO MENU OBJECT IN DATABASE
      var menu = await Menu.findById(req.params.menuId);
      menu.cards.push(card._id);
      menu.save();

      //UPLOAD BACKGROUND IMAGE TO S3 BUCKET
      var s3 = new AWS.S3();
      var params = {
        Bucket: 'school-menu-bucket',
        Key: card._id.toString(),
        Body: fs.createReadStream(files.backgroundImage[0].path)
      };
      s3.upload(params, async function(err, data) {
        await fs.unlink(files.backgroundImage[0].path);
        res.redirect(`/menu/${req.params.menuId}`);
      });
    } catch(err) {
      res.redirect(`/menu/${req.params.menuId}`);
    }
  });    
});

//GET card
router.get('/card/:cardId', removeFrameguard, async function(req, res, next) {
  try {
    //FIND CARD BY ID
    var card = await Card.findById(req.params.cardId);

    //GET IMAGE FROM S3 BUCKET
    var s3 = new AWS.S3();
    var params = {
      Bucket: "school-menu-bucket", 
      Key: card._id.toString()
    };
    s3.getObject(params, function(err, data) {
      if (err) console.log(err, err.stack);
      else {
      var imageFromS3 = (new Buffer(data.Body)).toString('base64');
      res.render('viewCard', {bgImage: imageFromS3, card: card, contentType: card.imageContentType});
      }
    });
  } catch(err) {
    if (!card) {
      res.render('notFound', {cardId: req.params.cardId});
    }
    console.error(err);
  }
});

//DELETE card
router.get('/card/:cardId/delete', async function(req, res, next) {
  try {
    //FIND CARD BY ID AND REMOVE
    var card = await Card.findByIdAndRemove(req.params.cardId);
    
    //DELETE IMAGE ASSOSCIATED WITH CARD FROM S3
    var s3 = new AWS.S3();
    var params = {
      Bucket: "school-menu-bucket", 
      Key: card._id.toString()
    };
    s3.deleteObject(params, function(err, data) {
      if (err) console.log(err, err.stack);
      else     res.redirect(`/menu/${card.menu}`);
    });
  } catch(err) {
    if(!card) {
      res.render('notFound', {cardId: req.params.cardId});
    }
    console.error(err);
  }
});

//GET edit form
router.get('/card/:cardId/edit', function(req, res, next) {
  try {
    async.parallel({
      lunches: function(callback) {
        //FIND ALL LUNCHES
        SampleLunch.find({}).exec(callback);
      },
      card: function(callback) {
        //FIND CARD BY ID
        Card.findById(req.params.cardId).exec(callback);
      },
    },async function(err, results) {
      if(!results.card) {
        res.render('notFound', {cardId: req.params.cardId});
      }
      //GET BACKGROUND IMAGE FROM S3
      var s3 = new AWS.S3();
      var params = {
        Bucket: "school-menu-bucket", 
        Key: results.card._id.toString()
      };

      //CHECK TO SEE WHICH ITEMS HAVE BEEN SELECTED
      for (var l = 0; l < results.lunches.length; l++) {
        for (var i = 0; i < results.card.items.length; i++) {
          if (results.lunches[l]._id.toString()==results.card.items[i]._id.toString()) {
              results.lunches[l].checked='true';
          }
        }
      }

      await s3.getObject(params, function(err, data) {
        if (err) console.log(err, err.stack);
        else {
          //CONVERT BACKGROUND IMAGE TO BASE64
          var imageFromS3 = (new Buffer(data.Body)).toString('base64');

          //RENDER EDIT FORM
          res.render('editCard', {bgImage: imageFromS3, card: results.card, contentType: results.card.imageContentType, lunches: results.lunches});
        }
      });
    });
  } catch(err) {
    if (err) { return next(err); }
  }
});

//EDIT card
router.post('/card/:cardId/edit', function(req, res, next) {
  var form = new multiparty.Form();
  var items = [];

  //PARSE MULTIPART FORM
  form.parse(req, async function(err, fields, files) {
    try {
      //CONVERT STRING VALUES FROM CHECK BOXES TO OBJECTS
      await fields.selectedItem.forEach((item) => {
        items.push(JSON.parse(item))
      });
      var fieldsToUpdate = {
        title: DOMPurify.sanitize(fields.cardTitle),
        items: items
      };
      //IF A BACKGROUND IMAGE WAS UPLOADED ADD IT TO FIELDSTOUPDATE
      if (files.backgroundImage[0].size != 0) {
        fieldsToUpdate.backgroundImage = DOMPurify.sanitize(files.backgroundImage[0].originalFilename);
        fieldsToUpdate.imageContentType = DOMPurify.sanitize(files.backgroundImage[0].headers['content-type']);
      }
      //FIND CARD BY ID AND UPDATE
      await Card.findByIdAndUpdate(req.params.cardId, fieldsToUpdate, function(err, card) {
        items = [];
        if (err) throw err;
        if (files.backgroundImage[0].size != 0) {
          //UPLOAD NEW BACKGROUND IMAGE IF THERE IS ONE
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
          //REDIRECT TO MENU
          res.redirect(`/menu/${card.menu}`);
        }
      });
    } catch(err) {
      Card.findById(req.params.cardId, function(err, card) {
        res.redirect(`/menu/${card.menu}`);
      });
    }
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
