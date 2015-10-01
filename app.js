var express = require('express')
var cors = require('cors')
var Promise = require('bluebird')
var FMIAPIKey = process.env.FMI_API_KEY || require('./apikey').key
var geocode = require('./server/reverse_geocode.js')
var gribParser = require('./server/grib_get_parser.js')
var observations = require('./server/observations.js')(FMIAPIKey)
var gribDownloader = require('./server/grib_downloader')

var app = express()
app.set('port', (process.env.PORT || 8000))
app.use(cors())

console.log("Starting fmiproxy..")

Promise.join(geocode.init(FMIAPIKey), gribDownloader.init(FMIAPIKey))
  .then(startServer)

function startServer() {
  console.log("Starting HTTP server..")

  app.get("/nearest-station", function(req, res, next) {
    res.json(geocode.getNearestStation(req.query.lat, req.query.lon)).end()
  })

  app.get("/hirlam-forecast", function(req, res, next) {
    gribParser.getForecastFromGrib(gribDownloader.gribFile, req.query.lat, req.query.lon)
      .then(function(forecast) { res.json(forecast).end() })
      .catch(next)
  })

  app.get("/observations", function(req, res, next) {
    if(req.query.geoid && req.query.place) {
      res.status(400).json({message: 'Use either geiod or place, not both!'}).end()
    } else if(req.query.geoid) {
      observations.getObservationsForGeoid(req.query.geoid)
        .then(function(observations) { res.json(observations).end() })
        .catch(next)
    } else if(req.query.place) {
      observations.getObservationsForPlace(req.query.place)
        .then(function(observations) { res.json(observations).end() })
        .catch(next)
    } else {
      res.status(400).json({message: 'Either geiod or place must be given!'}).end()
    }
  })

  app.listen(app.get('port'), function() {
    console.log("FMI proxy is running at localhost:" + app.get('port'))
  })

  app.use(function (err, req, res, next) {
    console.log(err)
    res.status(err.status || 500)
    res.json({
      message: err.message,
      error: err
    })
  })
}
