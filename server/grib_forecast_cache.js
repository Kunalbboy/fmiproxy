var gribGet = require('./utils').grib_get
var _ = require('lodash')
var Promise = require('bluebird')
var gribParser = require('./grib_get_parser')
var geolib = require('geolib')
var moment = require('moment')


var CPU_COUNT = require('os').cpus().length
var LAT_GRID_INCREMENT = 0.2
var LNG_GRID_INCREMENT = 0.5
var cachedForecasts = []


function getForecasts(bounds, startTime) {
  var startTime = moment(startTime || 0)
  var corners = [
    {latitude: bounds.swCorner.lat, longitude: bounds.swCorner.lng},
    {latitude: bounds.neCorner.lat, longitude: bounds.swCorner.lng},
    {latitude: bounds.neCorner.lat, longitude: bounds.neCorner.lng},
    {latitude: bounds.swCorner.lat, longitude: bounds.neCorner.lng}
  ]
  var forecastsInBounds = _.filter(cachedForecasts, function(forecast) {
    return geolib.isPointInside({ latitude: forecast.lat, longitude: forecast.lng }, corners)
  })
  var filteredByTime = _.map(forecastsInBounds, function(forecast) {
    forecast.items = _.filter(forecast.items, function(item) { return moment(item.time).isAfter(startTime) })
    return forecast
  })
  return filteredByTime
}

function refreshFrom(gribFile) {
  var startTime = new Date()
  console.log('Refreshing forecast cache..')
  return getGribBounds(gribFile)
    .then(function(bounds) { return createForecastLocations(bounds, LAT_GRID_INCREMENT, LNG_GRID_INCREMENT) })
    .then(function(forecastLocations) { return getForecastsFromGrib(forecastLocations, gribFile) })
    .then(function(forecasts) { cachedForecasts = forecasts })
    .then(function() { console.log('Forecast cache refreshed in ' + (new Date() - startTime) + 'ms. Contains ' + cachedForecasts.length + ' points.')})
}


function getForecastsFromGrib(locations, gribFile) {
  return Promise.map(locations, function(location) {
    return gribParser.getForecastItemsFromGrib(gribFile, location.lat, location.lng)
      .then(function(forecastItems) { return _.extend(location, { items: forecastItems }) })
  }, { concurrency: CPU_COUNT })
}

function createForecastLocations(bounds, latIncrement, lngIncrement) {
  var forecastLocations = []
  var latitudes = _.map(_.range(bounds.swCorner.lat, bounds.neCorner.lat, latIncrement), roundTo1Decimal)
  var longitudes = _.map(_.range(bounds.swCorner.lng, bounds.neCorner.lng, lngIncrement), roundTo1Decimal)

  latitudes.forEach(function(lat) {
    longitudes.forEach(function(lng) {
      forecastLocations.push({lat: lat, lng: lng})
    })
  })
  return forecastLocations
}

function getGribBounds(gribFile) {
  return gribGet(['-p', 'latitudeOfFirstGridPointInDegrees,longitudeOfFirstGridPointInDegrees,latitudeOfLastGridPointInDegrees,longitudeOfLastGridPointInDegrees', gribFile])
    .then(function(output) { return output.split('\n')[0] })
    .then(function(line) {
      var coords = _.map(line.trim().split(/ /), parseFloat)
      return { swCorner: { lat: coords[0], lng: coords[1] }, neCorner: { lat: coords[2], lng: coords[3] }}
    })
}

function roundTo1Decimal(num) {
  return Math.round( num * 10 ) / 10
}

module.exports = {
  refreshFrom: refreshFrom,
  getForecasts: getForecasts
}