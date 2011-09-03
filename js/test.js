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
        p.put('nesto', {test: 'best'}, this);    
    })
    .seq(function () {
        console.log(p.version('nesto'));
        p.get('nesto', this);
    })
    .seq(function (value) {
        console.log(value);
        p.get('key', this);
    })
    .seq(function (value) {
        console.log('value');
    })
    .catch(function (e) {
        console.log(e.message);
    });
