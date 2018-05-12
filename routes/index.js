var express = require('express');
var router = express.Router();
var AWS = require('aws-sdk');
var multiparty = require('multiparty');
var fs = require('fs');
var url = require('url');
var createDOMPurify = require('dompurify');
var { JSDOM } = require('jsdom');
var window = (new JSDOM('')).window;
var DOMPurify = createDOMPurify(window);
var fetch = require('node-fetch');
var moment = require('moment');

//"Sequelize" models for each table in database
var {Dashboard, Menu, Card, Day, Item} = require('../db/sequelize.js');

//GET -- ROOT OF WEBSITE
router.get('/', function (req, res, next) {
  res.render('index');
});

router.post('/', function (req, res, next) {
  res.redirect(`/dashboard/${req.body.dashboardId}`);
});

//GET -- DASHBOARD 
router.get('/dashboard/:dashboardGUID', function (req, res, next) {
  //Return dashboard if there is one matching req.params.dashboardGUID, otherwise create new dashboard
  Dashboard.findOrCreate({ where: { guid: req.params.dashboardGUID }, defaults: { guid: req.params.dashboardGUID } })
    .spread((dashboard, created) => {
      //Select all menus associated with dashboard
      Menu.findAll({ where: { dashboardId: dashboard.id } }).then((menus) => {
        res.render('dashboard', { dashboard: dashboard.guid, menus: menus });
      })
  }).catch(error => {
    if (error) {
      console.error(error);
      res.render('error', { message: 'Error', error: error })
    }
  });
});

//POST -- CREATE NEW MENU
router.post('/dashboard/:dashboardGUID/menu/create', function (req, res, next) {
  Dashboard.findOne({where: { guid: req.params.dashboardGUID }}).then((dashboard) => {
    Menu.create({
      title: DOMPurify.sanitize(req.body.menuTitle),
      url: DOMPurify.sanitize(req.body.healtheUrl),
      dashboardId: DOMPurify.sanitize(dashboard.id), //Foreign key that links menus to dashboards
      dashboardGUID: DOMPurify.sanitize(req.params.dashboardGUID)
    }).then(() => {
      //Redirect back to dashboard
      res.redirect(`/dashboard/${req.params.dashboardGUID}`);
    })
  }).catch(error => {
    if (error) {
      console.error(error);
      res.render('error', { message: 'Error', error: error })
    }
  })
});

//GET -- MENU DETAILS
router.get('/menu/:menuId', function(req, res, next) {
  Menu.findOne({ where: {id: req.params.menuId}, include: [{
      model: Card, 
      include: [{
        model: Day,
        where: {
          date: {
            $gte: new Date(moment().add(1, 'd').format('YYYY-MM-DD'))
            //Where day.date is greater than or equal to ($gte) today's date
            //new Date() subtracts a day, so added one in with moment
          }
        },
        include: [Item]
      }]}], order: [
        [ Card, Day, 'date', 'ASC' ]
      ]}).then((menu) => {
        /* menu contains:
            -array of cards in menu
              -array of items in each card
        */ 
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


//DELETE -- MENU
router.get('/menu/:menuId/delete', function (req, res, next) {
  Menu.findOne({ where: {id: req.params.menuId}, include: [ Card ] }).then((menu) => {
    if(menu) {
      //Delete menu
      Menu.destroy({ where: { id: req.params.menuId } });
      menu.cards.forEach((card) => {
        //Delete photos associated with each card from deleted menu
        var s3 = new AWS.S3();
        var params = {
          Bucket: "school-menu-bucket",
          Key: card.id.toString()
        };
        s3.deleteObject(params, function (err, data) {
          if (err) console.log(err, err.stack);
        });
        //end photo delete
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

//GET -- CREATE CARD FORM
router.get('/menu/:menuId/card/create', function (req, res, next) {
  Menu.findById(req.params.menuId).then((menu) => {
    //Redirect to new route so instanceId and districtId can be retrieved 
    res.redirect(`/menu/${req.params.menuId}${url.parse(menu.url).path}`);
  })
});
//GET -- CREATE CARD FORM (Continued from above)
router.get('/menu/:menuId/instance/:instanceId/district/:districtFile', function(req, res, next) {
  //Parse health-e living url
  var queryParameters = url.parse(req.originalUrl).query;
  var fetchedMenuId = queryParameters.split("menu_id=").slice(1).join('');
  var schoolId = queryParameters.split("&")[0].split("school_id=").slice(1).join('');
  var districtId = req.params.districtFile.split('.').slice(0, 1).join('');
  
  //Fetch data from lunch menu
  fetch(`http://inapi.stage.hmpdev.net/healtheliving/calendar/${req.params.instanceId}/${fetchedMenuId}/${districtId}/${schoolId}`)
  .then(function(response) {
    return response.json();
  })
  .then(function(fetchedMenu) {
    res.render('createCard', { mealDates: JSON.parse(fetchedMenu.recipes), menuId: req.params.menuId, currDate: moment().format('YYYY-MM-DD') });
  });
})

//POST new card
router.post('/menu/:menuId/card/create', function (req, res, next) {
  var selectedItemObject = {};
  /* selectedItemObject will organize selectedItem checkboxes by date
    {
      2018-05-11: [],
      2018-05-12: [],
      2018-05-13: [],
    }
  */
  var form = new multiparty.Form();
  form.parse(req, function (err, fields, files) {
    Card.create({
      menuId: DOMPurify.sanitize(req.params.menuId), //Foreign key that links cards to menu
      title: DOMPurify.sanitize(fields.cardTitle),
      customText: DOMPurify.sanitize(fields.customText),
      backgroundImage: DOMPurify.sanitize(files.backgroundImage[0].originalFilename),
      imageContentType: DOMPurify.sanitize(files.backgroundImage[0].headers['content-type'])
    }).then((card) => {
      //Create selectedItemObject keys
      fields.selectedItem.forEach((item) => {
        if (!selectedItemObject[JSON.parse(item).date]) {
          selectedItemObject[JSON.parse(item).date] = [];
        }
      })
      return card;
    }).then((card) => {
      //Loop through selectedItemObject keys which are strings of dates. Ex. '2018-05-12'
      Object.keys(selectedItemObject).forEach((day) => {
        //Create new day for each day in selectedItemObject
        Day.create({
          date: new Date(moment(day).add(1, 'd').format('YYYY-MM-DD')),
          cardId: card.id //Foreign key that links days to card
        }).then((newDay) => {
          fields.selectedItem.forEach((item) => {
            //Loop through every selectedItem checkbox
            //if it has the same date as newDay create item and link it to newDay
            if(JSON.parse(item).date == moment(newDay.date).format('YYYY-MM-DD')) {
              Item.create({
                title: JSON.parse(item).title,
                nid: JSON.parse(item).nid,
                dayId: newDay.id
              })
            }
          })
        })
      })
      return card;
    }).then((card) => {
      //Upload backgroundImage to S3
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


//GET -- CARD
router.get('/card/:cardId', function (req, res, next) {
  Card.findOne({where: { id: req.params.cardId }, include: [{
    model: Day, 
    where: {date: {
      $gte: new Date(moment().add(1, 'd').format('YYYY-MM-DD'))
      //Where day.date is greater than or equal to ($gte) today's date
      //new Date() subtracts a day, so added one in with moment
    },
  }, 
    include: [ Item ]
  }], order: [
  [ Day, 'date', 'ASC' ]
  ]}).then((card) => {
    if (card) {
      //Get backgroundImage from S3
      var s3 = new AWS.S3();
      var params = {
        Bucket: "school-menu-bucket",
        Key: card.id.toString()
      };
      s3.getObject(params, function (err, data) {
        if (err) console.log(err, err.stack);
        else {
          var imageFromS3 = (new Buffer(data.Body)).toString('base64');
          res.render('viewCard', { bgImage: imageFromS3, card: card, displayDay: card.days[0], contentType: card.imageContentType });
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
      //Delete image associated with card from S3
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

//GET -- EDIT CARD FORM
router.get('/menu/:menuId/card/:cardId/edit',function (req, res, next) {
  Menu.findById(req.params.menuId).then((menu) => {
    //Redirect to new route so instanceId and districtId can be retrieved 
    res.redirect(`/menu/${req.params.menuId}/card/${req.params.cardId}${url.parse(menu.url).path}`);
  })
});
//GET -- EDIT CARD FORM (continued from above)
router.get('/menu/:menuId/card/:cardId/instance/:instanceId/district/:districtFile', function(req, res, next) {
  //Parse health-e living url
  var queryParameters = url.parse(req.originalUrl).query;
  var fetchedMenuId = queryParameters.split("menu_id=").slice(1).join('');
  var schoolId = queryParameters.split("&")[0].split("school_id=").slice(1).join('');
  var districtId = req.params.districtFile.split('.').slice(0, 1).join('');

  Card.findOne({ where: {id: req.params.cardId}, include: [{ 
    model: Day, 
    where: {
      date: {
        $gte: new Date(moment().add(1, 'd').format('YYYY-MM-DD'))
        //Where day.date is greater than or equal to ($gte) today's date
        //new Date() subtracts a day, so added one in with moment
      },
    }, 
    include: [ Item ]
  }], order: [
    [ Day, 'date', 'ASC' ]
  ]}).then((card) => {
    fetch(`http://inapi.stage.hmpdev.net/healtheliving/calendar/${req.params.instanceId}/${fetchedMenuId}/${districtId}/${schoolId}`)
    .then(function(response) {
      return response.json();
    })
    .then(function(fetchedMenu) {
      var recipes =  JSON.parse(fetchedMenu.recipes);
      /* recipes contains:
          -days in menu calendar
            -array of meals for each day
              -array of items for each meal
      */
      
      if(card) {
        //Loop through each day, meal, and item to find which items have already been selected for each day
        for(var date in recipes) {
          for(var meal in recipes[date]) {
            recipes[date][meal].forEach((mealItem) => {

              card.days.forEach((day) => {
                //If day from database matches day from fetched menu
                if (moment(day.date).format('YYYY-MM-DD') == date) {
                  day.items.forEach((item) => {
                    //If the same item from fetch has already benn saved to database before
                    if (mealItem.nid == item.nid) {
                      //Give it the property checked so it will be rendered as a checked checkbox
                      mealItem.checked = 'true';
                    }
                  })
                }
              })

            })
          }
        }

        //Get backgroundImage form S3
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
            res.render('editCard', { mealDates: recipes, bgImage: imageFromS3, card: card, contentType: card.imageContentType, currDate: moment(card.days[0].date).format('YYYY-MM-DD')});
          }
        });
      } else {
        res.render('notFound', { cardId: req.params.cardId });
      }
    });
  }).catch(error => {
    if (error) {
      console.error(error);
      res.render('error', { message: 'Error', error: error })
    }
  })
})

//EDIT card
router.post('/card/:cardId/edit', function (req, res, next) {
  var selectedItemObject = {};
  /* selectedItemObject organizes selectedItem checkboxes in an array by date
    {
      2018-05-11: ['{title: 'Milk, Nonfat Flavored 1 cup', nid: '2443', date: '2018-05-11'}', 
                  '{title: '1 M/MA (Lunch)', nid: '16431', date: '2018-05-11'}']
    }
  */
  var form = new multiparty.Form();
  form.parse(req, function (err, fields, files) {
    Card.findOne({ where: {id: req.params.cardId }, include: [{
      model: Day,
      include:[ Item ]
    }]}).then((card) => {
      //Create selectedItemObject keys
      fields.selectedItem.forEach((item) => {
        if (!selectedItemObject[new Date(moment(JSON.parse(item).date).add(1 ,'d').format('YYYY-MM-DD'))]) {
          selectedItemObject[new Date(moment(JSON.parse(item).date).add(1 ,'d').format('YYYY-MM-DD'))] = [];
        }
      })
      return card;
    }).then((card) => {
      //Put each selected item in array by date for corresponding key in selectedItemObject
      fields.selectedItem.forEach((item) => {
        for(var date in selectedItemObject) {
          if (new Date(moment(JSON.parse(item).date).add(1 ,'d').format('YYYY-MM-DD')) == date) {
            selectedItemObject[new Date(moment(JSON.parse(item).date).add(1 ,'d').format('YYYY-MM-DD'))].push(JSON.parse(item));
          }
        }
      })
      return card;
    }).then((card) => {
      Object.keys(selectedItemObject).forEach((date) => {
        //Select day that matches date from selectedItemObject
        Day.findOne({ where: { cardId: card.id, date: date }, include: [Item] }).then((day) => {
          //If day is not in database
          if(!day) {
            Day.create({
              date: new Date(moment(date).add(1 ,'d').format('YYYY-MM-DD')),
              cardId: card.id
            }).then((newDay) => {
              selectedItemObject[date].forEach((item) => {
                Item.create({
                  title: item.title,
                  nid: item.nid,
                  dayId: newDay.id //Foreign key that links items to days
                })
              })
            })
          } else {
            //If day is in database
            //Loop through items for that day in selectedItemObject and day in database
            for(var i = 0; i < (selectedItemObject[date].length > day.items.length ? selectedItemObject[date].length : day.items.length); i++) {
              //if the there is an item selected and there is an item in database, update it
              if (selectedItemObject[date][i] && day.items[i]) {
                Item.update({
                  title: selectedItemObject[date][i].title,
                  nid: selectedItemObject[date][i].nid,
                  dayId: day.id
                }, { where: { id: day.items[i].id }})
              //If there is a selected item that is not in the database, create it
              } else if (selectedItemObject[date][i] && !day.items[i]){
                Item.create({
                  title: selectedItemObject[date][i].title,
                  nid: selectedItemObject[date][i].nid,
                  dayId: day.id
                })
              //If there is a item in the database that was not selected, delete it
              } else if (day.items[i] && !selectedItemObject[date][i]) {
                Item.destroy({where: { id: day.items[i].id}});
              }
            }
          }
        })
      });
      return card;
    }).then((card) => { 
      //If day.date is not in selectedItemObject, delete that day from database
      Day.findAll({ where: { cardId: card.id, date: { $notIn: Object.keys(selectedItemObject) } } }).then((day) => {
        day.forEach((day) => {
          Day.destroy({where: {id: day.id}});
        })
      }).then(() => {
        var fieldsToUpdate = {
          title: DOMPurify.sanitize(fields.cardTitle),
          customText: DOMPurify.sanitize(fields.customText),
        };
        //If a backgroundImage was uploaded, add it to fieldsToUpdate
        if (files.backgroundImage[0].size != 0) {
          fieldsToUpdate.backgroundImage = DOMPurify.sanitize(files.backgroundImage[0].originalFilename);
          fieldsToUpdate.imageContentType = DOMPurify.sanitize(files.backgroundImage[0].headers['content-type']);
        }
  
        Card.update(fieldsToUpdate, { where: { id: card.id }});
        //Upload backgroundImage to S3
        if (files.backgroundImage[0].size != 0) {
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

module.exports = router;