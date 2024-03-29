var fs       = require('fs')
  , path     = require('path')
  , Seq      = require('seq')
  , jsondate = require('./lib/jsondate')
  , crc      = require('./lib/crc');


function noop() {}


/*
        <-------------------------------------- crc coverage ---------------------------------------->       
  +-----+-----------+---------+-----------------+--------------+----------+------------+-----+-------+
  | crc | timestamp | version | previous db ptr | previous ptr | key size | value size | key | value |
  +-----+-----------+---------+-----------------+--------------+----------+------------+-----+-------+
    32        64        32            32               32           16          32       ...    ...

*/

/* Constants */
var HEADERS_SIZE = 30;
var MAX_DB_SIZE  = Math.pow(2, 32) - 1;



/* Patuljak db implementation */
Patuljak = exports.Patuljak = function Patuljak(root) {
    if (!(this instanceof Patuljak)) {
        return new Patuljak(root);
    }
    this.root = path.normalize(root);
    this.db = 0;
    this.fd = null;
    this.pos = 0;
    this.store = {};
}

/* Private metods */

Patuljak.prototype._load_dbs = function (dbs, cb) {
    var self = this
      , db  = dbs.shift();
    if (db === undefined) {
        Seq()
            .seq(function () {
                fs.open(path.join(self.root, self.db + '.pat'), 'a', this);
            })
            .seq(function (fd) {
                self.fd = fd;
                cb(null, self);
            })
            .catch(cb)
    } else {
        self.db = db;
        var db_file = path.join(self.root, db + '.pat');
        Seq()
            .par(function () {
                fs.stat(db_file, this);
            })
            .par(function () {
                fs.open(db_file, 'r', this);
            })
            .seq(function (stats, fd) {
                self.pos = stats.size;
                self._load_db(db, fd, 0, this);
            })
            .seq(function () {
                self._load_dbs(dbs, cb);
            })
            .catch(cb);
    }
};


Patuljak.prototype._load_db = function (db, fd, pos, cb) {
    var self = this;
    
    if (pos < self.pos) {
        var headers = null;
        Seq()
            .seq(function () { self._read_headers(db, fd, pos, this); })
            .seq(function (hdrs) {
                headers = hdrs;
                fs.read(fd, new Buffer(headers.key_size), 0, headers.key_size, pos + HEADERS_SIZE, this);
            })
            .seq(function (bytesRead, buffer) {
                self.store[buffer.toString('utf8')] = headers;
                self._load_db(db, fd, pos + HEADERS_SIZE + headers.key_size + headers.value_size, cb);
            })
            .catch(cb);
    } else {
        cb(null);
    }
}


Patuljak.prototype._read_headers = function (db, fd, pos, cb) {
    var self = this;
    
    fs.read(fd, new Buffer(HEADERS_SIZE), 0, HEADERS_SIZE, pos, function (err, bytesRead, buffer) {
        if (err) {
            cb(err);
        } else {
            var crc = buffer.readUInt32BE(0)
              , headers = {
                pos        : pos,
                db         : db,
                timestamp  : buffer.readDoubleBE(4),
                version    : buffer.readUInt32BE(12),
                prev_db    : buffer.readUInt32BE(16),
                prev_pos   : buffer.readUInt32BE(20),
                key_size   : buffer.readUInt16BE(24),
                value_size : buffer.readUInt32BE(26)
            };
            cb(null, headers);
        }
    });
};


Patuljak.prototype._write = function (headers, data, cb) {
    var self = this;
    
    var buffer = new Buffer(HEADERS_SIZE + data.length);
    
    buffer.writeDoubleBE(headers.timestamp,   4); // timestamp
    buffer.writeUInt32BE(headers.version,    12); // version
    buffer.writeUInt32BE(headers.prev_db,    16); // previous file ptr
    buffer.writeUInt32BE(headers.prev_pos,   20); // previous ptr
    buffer.writeUInt16BE(headers.key_size,   24); // key size
    buffer.writeUInt32BE(headers.value_size, 26); // value size
    data.copy(buffer, 30)
    // Calculate CRC32
    buffer.writeInt32BE(crc.crc32(buffer.slice(4)), 0);
            
    Seq()
        .seq(function (fd) {
            fs.write(self.fd, buffer, 0, buffer.length, self.pos, this);
        })
        .seq(function (written, buffer) {
            self.pos += buffer.length;
            // Rotate if max file size exceeded
            if (self.pos > MAX_DB_SIZE) {
                self.db += 1;
                self.pos = 0;
                fs.open(path.join(self.root, self.db + '.pat'), 'a', this);
            } else {
                this(null)
            }
        })
        .seq(function (fd) {
            if (fd !== undefined) {
                self.fd = fd;
            }
            cb(null, headers);
        })
        .catch(cb);
};


Patuljak.prototype._get_version = function (version, headers, cb) {
    var self = this;
    
    if (version < headers.version) {
        Seq()
            .seq(function () {
                fs.open(path.join(self.root, headers.prev_db + '.pat'), 'r', this);
            })
            .seq(function (fd) {
                current_fd = fd;
                self._read_headers(headers.prev_db, fd, headers.prev_pos, this);
            })
            .seq(function (new_headers) {
                self._get_version(version, new_headers, cb);
            })
            .catch(cb)
    } else if (version == headers.version) {
        cb(null, headers);
    } else {
        cb(new Error('Versioning error! Searched version: ' + version + ', Current version: ' + headers.version));
    }
};


/* Public methods */
Patuljak.prototype.keys = function () {
    return Object.keys(this.store);
}

Patuljak.prototype.version = function (key) {
    var self = this;
    
    var headers = self.store[key];
    if (headers === undefined) {
        return null;
    } else {
        return headers.version;
    }
};

Patuljak.prototype.initialize = function (cb) {
    var self = this;
    
    cb = cb || noop;
    
    path.exists(self.root, function (exists) {
        if (exists) {
            Seq()
                .seq(function() { fs.readdir(self.root, this); })
                .seq(function(files) {
                    var dbs = [];
                    files.forEach(function (file) {
                        if (path.extname(file) === '.pat') {
                            dbs.push(parseInt(path.basename(file, '.pat'), 10));
                        }
                    });
                    self._load_dbs(dbs.sort(), cb)
                })
                .catch(cb);
        } else {
            Seq()
              .seq(function () { fs.mkdir(self.root, 0755, this); })
              .seq(function () { fs.open(path.join(self.root, self.db + '.pat'), 'a', this); })
              .seq(function (fd) {
                  self.fd = fd;
                  self.pos = 0;
                  cb(null, self);
              })
              .catch(cb);
        }
    })
};


Patuljak.prototype.sget = function (key, version, cb) {
    var self = this;
    
    cb = arguments[arguments.length - 1];
    if (typeof(cb) !== 'function') {
        return;
    }
    if (version === cb) {
        version = null;
    }
    
    var headers = self.store[key];
    if (headers === undefined) {
        cb(new Error('Not found'));
    } else {
        if (version === null) {
            version = headers.version;
        }
        /* Version checking */
        if (typeof(version) !== 'number') {
            cb(new Error('Invalid version (version must be a number)'));
        } else if (Math.floor(version) !== version) {
            cb(new Error('Invalid version: ' + version));
        } else if (version > headers.version || version < 0) {
            cb(new Error('Invalid Version: ' + version + ' Last Version: ' + headers.version));
        /* Version is valid */
        } else {
            Seq()
                .seq(function () {
                    self._get_version(version, headers, this);
                })
                .seq(function (new_headers) {
                    headers = new_headers;
                    fs.open(path.join(self.root, headers.db + '.pat'), 'r', this);
                })
                .seq(function (fd) {
                    fs.read(fd, new Buffer(headers.value_size), 0, headers.value_size,
                            headers.pos + HEADERS_SIZE + headers.key_size, this);
                })
                .seq(function (bytesRead, buffer) {
                    cb(null, buffer.toString());
                })
                .catch(cb);
        }
    }
}

Patuljak.prototype.get = function (key, version, cb) {
    var self = this;
    
    cb = arguments[arguments.length - 1];
    if (typeof(cb) !== 'function') {
        return;
    }
    if (version === cb) {
        version = null;
    }
    
    self.sget(key, version, function (err, str) {
        if (err) {
            cb(err);
        } else {
            try {
                cb(null, JSON.parse(str));    
            } catch (err) {
                cb(err);
            }    
        }
    });
};


Patuljak.prototype.sput = function (key, value, cb) {
    cb = cb || noop;
    
    var self = this;
    
    // Setup new headerss
    var headers = self.store[key];
    if (headers === undefined) {
        headers = {
            version  : 0,
            prev_db  : 0,
            prev_pos : 0
        };
    } else {
        headers.version += 1;
        headers.prev_db  = headers.db;
        headers.prev_pos = headers.pos;
    }
    headers.timestamp  = Date.now();
    headers.key_size   = Buffer.byteLength(key,   'utf8');
    headers.value_size = Buffer.byteLength(value, 'utf8');
    headers.db         = self.db;
    headers.pos        = self.pos;
    Seq()
        .seq(function () {
            self._write(headers, Buffer(key + value), this);
        })
        .seq(function (headers) {
            self.store[key] = headers;
            cb(null);
        })
        .catch(cb);
}

Patuljak.prototype.put = function (key, value, cb) {
    this.sput(key, JSON.stringify(value), cb);
};
