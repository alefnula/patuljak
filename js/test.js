var fs       = require('fs')
  , patuljak = require('./patuljak');

patuljak.Patuljak('db').initialize(function (err, p) {
    if (err) {
        console.log(err);
        return;
    }
    console.log('inicijalizovao');
    console.log(p.keys());
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
