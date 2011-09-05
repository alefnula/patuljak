var fs       = require('fs')
  , Seq      = require('seq')
  , patuljak = require('./patuljak');

var p;

Seq()
    .seq(function () {
        patuljak.Patuljak('db').initialize(this);
    })
    .seq(function (patuljak) {
        p = patuljak;
        p.put('nesto', {test: 'verzija 0', date: new Date()}, this);
    })
    .seq(function () {
        p.put('nesto', {test: 'verzija 1', date: new Date()}, this);
    })
    .seq(function () {
        p.put('nesto', {test: 'verzija 2', date: new Date()}, this);
    })
    .seq(function () {
        p.put('nesto', {test: 'verzija 3', date: new Date()}, this);
    })
    .seq(function () {
        p.put('nesto', {test: 'verzija 4', date: new Date()}, this);
    })
    .seq(function () {
        console.log(p.version('nesto'));
        p.get('nesto', this);
    })
    .seq(function (value) {
        console.log(value);
        p.get('nesto', 2, this);
    })
    .seq(function (value) {
        console.log(value);
        p.get('nesto', 0, this);
    })
    .seq(function (value) {
        console.log(value);
        p.get('nesto', '30', this);
    })
    .catch(function (e) {
        console.log(e.message);
    });
