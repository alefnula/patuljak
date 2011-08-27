var fs       = require('fs')
  , patuljak = require('./patuljak');

p = patuljak.Patuljak('db.db');
p.initialize(function () {
    console.log('inicijalizovao');
    p.put('nesto', 'sasvim drugacije', function () {
        console.log(p.keyStore);
        p.get('key', function (value) {
            console.log('Dobio: ' + value);
            p.get('nesto', function (value) {
                console.log('Dobio: ' + value);
            });
        });
    });
})


process.on('uncaughtException', function (err) {
  console.log('Caught exception: ' + err);
});
