var fs   = require('fs')
  , path = require('path');


function noop() {}


/*
        <--------------------------------------- crc coverage --------------------------------------->       
  +-----+-----------+---------+-------------------+--------------+----------+------------+-----+-------+
  | crc | timestamp | version | previous file ptr | previous ptr | key size | value size | key | value |
  +-----+-----------+---------+-------------------+--------------+----------+------------+-----+-------+
    32        32        32              32               32           16          32       ...    ...

*/


function NotFound() {
    Error
}

Patuljak = exports.Patuljak = function Patuljak(database) {
    if (!(this instanceof Patuljak)) {
        return new Patuljak(database);
    }
    this.database = path.normalize(database);
    this.current_pat = 0;
    this.fd = null;
    this.position = 0;
    this.keyStore = {};
}


Patuljak.prototype.keys = function () {
    return Object.keys(this.keyStore);
}

Patuljak.prototype.initialize = function (cb) {
    self = this;
    path.exists(self.database, function  (exists) {
        if (exists) {
            fs.readdir(self.database, function (err, files) {
                if (err) {
                    cb(err, null);
                } else {
                    var pat_files = [];
                    files.forEach(function (file) {
                        if (path.extname(file) === '.pat') {
                            pat_files.push(parseInt(path.basename(file, '.pat'), 10));
                        }
                    });
                    self._load_pats(pat_files.sort(), cb)
                }
            });
            
        } else {
            fs.mkdir(self.database, 0755, function (err) {
                if (err) {
                    cb(err, null);
                } else {
                    fs.open(path.join(self.database, '0.pat'), 'a+', function (err, fd) {
                        if (err) {
                            cb(err, null)
                        } else {
                            self.fd = fd;
                            self.position = 0;
                            cb(null, self);
                        }
                    });
                }
            });
        }
    })
};


Patuljak.prototype._load_pats = function (pat_files, cb) {
    var self = this
      , pat  = pat_files.shift();
    if (pat === undefined) {
        fs.open(path.join(self.database, self.current_pat + '.pat'), 'a+', function (err, fd) {
            if (err) {
                cb(err, null);
            } else {
                self.fd = fd;
                cb(null, self);
            }
        });
    } else {
        self.current_pat = pat;
        var pat_file = path.join(self.database, pat + '.pat');
        fs.stat(pat_file, function (err, stats) {
            if (err) {
                cb(err, null);
            } else {
                self.position = stats.size;
                fs.open(pat_file, 'r', function (err, fd) {
                    if (err) {
                        cb(err);
                    } else {
                        self._load_pat(pat, fd, 0, function (err) {
                            if (err) {
                                cb(err, null);
                            } else {
                                self._load_pats(pat_files, cb);
                            }
                        });
                    }
                });
                
            }
        });
    }
};


Patuljak.prototype._load_pat = function _read(pat, fd, position, cb) {
    self = this;
    if (position < self.position) {
        self.readHeaders(pat, fd, position, function (err, headers) {
            if (err) {
                cb(err);
            } else {
                position += self.HEADERS_SIZE;
                fs.read(fd, new Buffer(headers.key_size), 0, headers.key_size, position, function (err, bytesRead, buffer) {
                    if (err) {
                        cb(err);
                    } else {
                        self.keyStore[buffer.toString('utf8')] = headers;
                        position += (headers.key_size + headers.value_size);
                        self._load_pat(pat, fd, position, cb);                    
                    }
                });                
            }
        });
    } else {
        cb(null);
    }
}


Patuljak.prototype.HEADERS_SIZE = 26;

Patuljak.prototype.writeHeaders = function writeHeaders(headers, callback) {
    var self = this;
    
    var buffer = new Buffer(self.HEADERS_SIZE);
    buffer.writeUInt32BE(0,                          0); // crc
    buffer.writeUInt32BE(0                ,          4); // timestamp
    buffer.writeUInt32BE(headers.version,            8); // version
    buffer.writeUInt32BE(headers.previous_file_ptr, 12); // previous file ptr
    buffer.writeUInt32BE(headers.previous_ptr,      16); // previous ptr
    buffer.writeUInt16BE(headers.key_size,          20); // key size
    buffer.writeUInt32BE(headers.value_size,        22); // value size
    
    headers.position = self.position;
    fs.write(self.fd, buffer, 0, self.HEADERS_SIZE, self.position, function (err, written, buffer) {
        self.position += self.HEADERS_SIZE;
        if (callback) { callback(headers); };
    });
};

Patuljak.prototype.readHeaders = function readHeaders(pat, fd, position, cb) {
    fs.read(fd, new Buffer(this.HEADERS_SIZE), 0, this.HEADERS_SIZE, position, function (err, bytesRead, buffer) {
        if (err) {
            cb(err, null);
        } else {
            var crc = buffer.readUInt32BE(0)
              , headers = {
                'position'          : position,
                'pat'               : pat,
                'timestamp'         : buffer.readUInt32BE(4),
                'version'           : buffer.readUInt32BE(8),
                'previous_file_ptr' : buffer.readUInt32BE(12),
                'previous_ptr'      : buffer.readUInt32BE(16),
                'key_size'          : buffer.readUInt16BE(20),
                'value_size'        : buffer.readUInt32BE(22)
            };
            cb(null, headers);            
        }
    });
};


Patuljak.prototype.bget = function bget(key, version, callback) {
    callback = arguments[arguments.length - 1];
    if (typeof(callback) !== 'function') {
        return;
    }
    var self = this;
    
    var headers = self.keyStore[key] || null;
    if (headers === null) {
        callback(new Error('Key not found'), null);
    } else {
        fs.open(self.path, 'r', function (err, fd) {
            fs.read(fd, new Buffer(headers.value_size), 0, headers.value_size, headers.position + self.HEADERS_SIZE + headers.key_size, function (err, bytesRead, buffer) {
                if (err) {
                    callback(err, null);
                }
                callback(buffer);
            });    
        });
    }
}

Patuljak.prototype.get = function get(key, version, callback) {
    callback = arguments[arguments.length - 1];
    if (typeof(callback) !== 'function') {
        return;
    }
    
    
};


Patuljak.prototype.put = function put(key, value, callback) {
    callback = callback || noop;
    
    var self = this;
    
    // Setup new headerss
    var headers = self.keyStore[key];
    if (headers === undefined) {
        headers = {'version': 0, 'previous_file_ptr': 0, 'previous_ptr': 0 };
    } else {
        headers.version += 1;
        headers.previous_file_ptr = headers.pat;
        headers.previous_ptr      = headers.position;
    }
    headers.timestamp  = Date.now();
    headers.key_size   = Buffer.byteLength(key, 'utf8');
    headers.value_size = Buffer.byteLength(value, 'utf8');
    
    self.writeHeaders(headers, function (headers) {
        self.keyStore[key] = headers;
        var buf = Buffer(key + value);
        fs.write(self.fd, buf, 0, buf.length, self.position, function (err, written, buffer) {
            self.position += buf.length;
            callback();
        });
    });
}
