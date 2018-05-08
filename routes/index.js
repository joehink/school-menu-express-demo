var express = require('express');
var router = express.Router();
var async = require('async');
var AWS = require('aws-sdk');
var multiparty = require('multiparty');
var fs = require('fs');
var url = require('url');
var createDOMPurify = require('dompurify');
var { JSDOM } = require('jsdom');
var window = (new JSDOM('')).window;
var DOMPurify = createDOMPurify(window);
var mysql = require('mysql');
var fetch = require('node-fetch');

var SampleLunch = require('../models/SampleLunch');

var {Dashboard, Menu, Card, Item} = require('../sequelize.js');

/* GET home page. */
router.get('/', function (req, res, next) {
  res.send('Put in your url');
});

// GET dashboard // Create dashboard if does not exist
router.get('/dashboard/:dashboardGUID', async function (req, res, next) {
  Dashboard.findOrCreate({ where: { guid: req.params.dashboardGUID }, defaults: { guid: req.params.dashboardGUID } })
    .spread((dashboard, created) => {
      Menu.findAll({ where: { dashboardId: dashboard.id } }).then((menus) => {
        res.render('index', { dashboard: dashboard.guid, menus: menus });
      })
  }).catch(error => {
    if (error) {
      console.error(error);
      res.render('error', { message: 'Error', error: error })
    }
  });
});

//CREATE menu 
router.post('/dashboard/:dashboardGUID/menu/create', function (req, res, next) {
  Dashboard.findOne({where: { guid: req.params.dashboardGUID }}).then((dashboard) => {
    Menu.create({
      title: DOMPurify.sanitize(req.body.menuTitle),
      url: DOMPurify.sanitize(req.body.healtheUrl),
      dashboardId: DOMPurify.sanitize(dashboard.id),
      dashboardGUID: DOMPurify.sanitize(req.params.dashboardGUID)
    }).then(() => {
      res.redirect(`/dashboard/${req.params.dashboardGUID}`);
    })
  }).catch(error => {
    if (error) {
      console.error(error);
      res.render('error', { message: 'Error', error: error })
    }
  })
});

//GET menu deatails
router.get('/menu/:menuId', function(req, res, next) {
  Menu.findOne({ where: {id: req.params.menuId}, include: [{
      model: Card, 
      include: [
        Item
      ]}]}).then((menu) => {
        if(menu) {
          res.render('menuDetail', {cards: menu.cards, menu: menu, host: req.headers.host})
        } else {
          res.render('notFound', {menuId: req.params.menuId})
        }
  }).catch(error => {
    if (error) {
      console.error(error);
      res.render('error', { message: 'Error', error: error })
    }
  })
})


//DELETE menu
router.get('/menu/:menuId/delete', function (req, res, next) {
  Menu.findOne({ where: {id: req.params.menuId}, include: [ Card ] }).then((menu) => {
    if(menu) {
      Menu.destroy({ where: { id: req.params.menuId } });
      menu.cards.forEach((card) => {
        //DELETE PHOTOS ASSOCIATED WITH EACH CARD 
        var s3 = new AWS.S3();
        var params = {
          Bucket: "school-menu-bucket",
          Key: card.id.toString()
        };
        s3.deleteObject(params, function (err, data) {
          if (err) console.log(err, err.stack);
        });
      })
      res.redirect(`/dashboard/${menu.dashboardGUID}`);
    } else {
      res.render('notFound', {menuId: req.params.menuId})
    }
  }).catch(error => {
    if (error) {
      console.error(error);
      res.render('error', { message: 'Error', error: error })
    }
  })
});

//GET create card form
router.get('/menu/:menuId/card/create', function (req, res, next) {
  Menu.findById(req.params.menuId).then((menu) => {
    res.redirect(`/menu/${req.params.menuId}${url.parse(menu.url).path}`);
  })
});

router.get('/menu/:menuId/instance/:instanceId/district/:districtFile', function(req, res, next) {
  var queryParameters = url.parse(req.originalUrl).query;
  var fetchedMenuId = queryParameters.split("menu_id=").slice(1).join('');
  var schoolId = queryParameters.split("&")[0].split("school_id=").slice(1).join('');
  var districtId = req.params.districtFile.split('.').slice(0, 1).join('');
  
  fetch(`http://inapi.stage.hmpdev.net/healtheliving/calendar/${req.params.instanceId}/${fetchedMenuId}/${districtId}/${schoolId}`)
  .then(function(response) {
    return response.json();
  })
  .then(function(myJson) {
    res.render('createCard', { mealDates: JSON.parse(myJson.recipes), menuId: req.params.menuId });
  });
})

//CREATE new card
router.post('/menu/:menuId/card/create', function (req, res, next) {
  var form = new multiparty.Form();
  //PARSE MULTIPART FORM WITH MULTIPARTY PACKAGE
  form.parse(req, function (err, fields, files) {
    Card.create({
      menuId: DOMPurify.sanitize(req.params.menuId),
      title: DOMPurify.sanitize(fields.cardTitle),
      backgroundImage: DOMPurify.sanitize(files.backgroundImage[0].originalFilename),
      imageContentType: DOMPurify.sanitize(files.backgroundImage[0].headers['content-type'])
    }).then((card) => {

      fields.selectedItem.forEach((item) => {
        Item.create({
          data: item,
          cardId: card.id
        })
      })
      
      //UPLOAD BACKGROUND IMAGE TO S3 BUCKET
      var s3 = new AWS.S3();
      var params = {
        Bucket: 'school-menu-bucket',
        Key: card.id.toString(),
        Body: fs.createReadStream(files.backgroundImage[0].path)
      };
      s3.upload(params, function (err, data) {
        fs.unlink(files.backgroundImage[0].path);
        res.redirect(`/menu/${req.params.menuId}`);
      });
    }).catch(error => {
      if (error) {
        console.error(error);
        res.render('error', { message: 'Error', error: error })
      }
    })
  });
});

//GET card
router.get('/card/:cardId', function (req, res, next) {
  Card.findOne({ where: { id: req.params.cardId }, include: {model: Item} }).then((card) => {
    if (card) {
      //GET IMAGE FROM S3 BUCKET
      var s3 = new AWS.S3();
      var params = {
        Bucket: "school-menu-bucket",
        Key: card.id.toString()
      };
      s3.getObject(params, function (err, data) {
        if (err) console.log(err, err.stack);
        else {
          var imageFromS3 = (new Buffer(data.Body)).toString('base64');
          res.render('viewCard', { bgImage: imageFromS3, card: card, contentType: card.imageContentType });
        }
      });
    } else {
      res.render('notFound', { cardId: req.params.cardId } );
    }
  }).catch(error => {
    if (error) {
      console.error(error);
      res.render('error', { message: 'Error', error: error })
    }
  })
});

//DELETE card
router.get('/card/:cardId/delete', function (req, res, next) {
  Card.findById(req.params.cardId).then((card) => {
    if(card) {
      Card.destroy({ where: { id: req.params.cardId } });
      //DELETE IMAGE ASSOSCIATED WITH CARD FROM S3
      var s3 = new AWS.S3();
      var params = {
        Bucket: "school-menu-bucket",
        Key: card.id.toString()
      };
      s3.deleteObject(params, function (err, data) {
        if (err) console.log(err, err.stack);
        else res.redirect(`/menu/${card.menuId}`);
      });
    } else {
      res.render('notFound', { cardId: req.params.cardId });
    }
  }).catch(error => {
    if (error) {
      console.error(error);
      res.render('error', { message: 'Error', error: error })
    }
  })
});

//GET edit form
router.get('/card/:cardId/edit',function (req, res, next) {
  Card.findOne({ where: {id: req.params.cardId}, include: [ Item ]}).then((card) => {
    if(card) {
      SampleLunch.find({}).then((lunches) => {
        //CHECK TO SEE WHICH ITEMS HAVE BEEN SELECTED
        for (var l = 0; l < lunches.length; l++) {
          for (var i = 0; i < card.items.length; i++) {
            if (lunches[l]._id.toString() == JSON.parse(card.items[i].data)._id.toString()) {
              lunches[l].checked = 'true';
            }
          }
        }
        //GET BACKGROUND IMAGE FROM S3
        var s3 = new AWS.S3();
        var params = {
          Bucket: "school-menu-bucket",
          Key: card.id.toString()
        };
        s3.getObject(params, function (err, data) {
          if (err) console.log(err, err.stack);
          else {
            //CONVERT BACKGROUND IMAGE TO BASE64
            var imageFromS3 = (new Buffer(data.Body)).toString('base64');
  
            //RENDER EDIT FORM
            res.render('editCard', { bgImage: imageFromS3, card: card, contentType: card.imageContentType, lunches: lunches });
          }
        });
      })
    } else {
      res.render('notFound', { cardId: req.params.cardId });
    }
  }).catch(error => {
    if (error) {
      console.error(error);
      res.render('error', { message: 'Error', error: error })
    }
  })
});

//EDIT card
router.post('/card/:cardId/edit', function (req, res, next) {
  var form = new multiparty.Form();
  //PARSE MULTIPART FORM
  form.parse(req, function (err, fields, files) {
    Item.findAll({ where: {cardId: req.params.cardId } }).then((items) => {
      for(var i = 0; i < (fields.selectedItem.length > items.length ? fields.selectedItem.length : items.length); i++) {
        if ( items[i] && fields.selectedItem[i] ) {
          Item.update({
            data: fields.selectedItem[i],
            cardId: req.params.cardId
          }, { where: { id: items[i].id }})
        } else if (fields.selectedItem[i] && !items[i]){
          Item.create({
            data: fields.selectedItem[i],
            cardId: req.params.cardId
          })
        } else if (items[i] && !fields.selectedItem[i]) {
          Item.destroy({where: { id: items[i].id }});
        }
      }
    }).then(() => {
      var fieldsToUpdate = {
        title: DOMPurify.sanitize(fields.cardTitle),
      };
      //IF A BACKGROUND IMAGE WAS UPLOADED ADD IT TO FIELDSTOUPDATE
      if (files.backgroundImage[0].size != 0) {
        fieldsToUpdate.backgroundImage = DOMPurify.sanitize(files.backgroundImage[0].originalFilename);
        fieldsToUpdate.imageContentType = DOMPurify.sanitize(files.backgroundImage[0].headers['content-type']);
      }
      Card.findById(req.params.cardId).then((card) => {
        Card.update(fieldsToUpdate, { where: { id: req.params.cardId }});
          console.log('UPDATE!!!!!!!');
          console.log(card);
          if (files.backgroundImage[0].size != 0) {
            //UPLOAD NEW BACKGROUND IMAGE IF THERE IS ONE
            var s3 = new AWS.S3();
            var params = {
              Bucket: 'school-menu-bucket',
              Key: card.id.toString(),
              Body: fs.createReadStream(files.backgroundImage[0].path)
            }
            s3.upload(params, function (err, data) {
              res.redirect(`/menu/${card.menuId}`);
            })
          } else {
            //REDIRECT TO MENU
            res.redirect(`/menu/${card.menuId}`);
          }
        })
      }).catch(error => {
        if (error) {
          console.error(error);
          res.render('error', { message: 'Error', error: error })
        }
      })
    })
});







//CREATE SAMPLE LUNCHES
router.post('/create-sample-lunch', function (req, res, next) {
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
  }, function (err, sampleLunch) {
    if (err) throw err;
    res.send('hey');
  })
});

module.exports = router;
