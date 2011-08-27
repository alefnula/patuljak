var fs   = require('fs')
  , path = require('path');

/*
        <------------------------------ crc coverage ------------------------------>       
  +-----+-----------+---------+--------------+----------+------------+-----+-------+
  | crc | timestamp | version | previous ptr | key size | value size | key | value |
  +-----+-----------+---------+--------------+----------+------------+-----+-------+
    32        32        32           32           16          32       ...    ...

*/

Patuljak = exports.Patuljak = function Patuljak(database) {
    if (!(this instanceof Patuljak)) {
        return new Patuljak(database);
    }
    this.path     = path.normalize(database);
    this.keyStore = {};
}


Patuljak.prototype._read = function _read(fd, position, callback) {
    self = this;
    if (position < self.position) {
        self.readHeaders(fd, position, function (headers) {
            position += self.HEADERS_SIZE;
            fs.read(fd, new Buffer(headers.key_size), 0, headers.key_size, position, function (err, bytesRead, buffer) {
                self.keyStore[buffer.toString('utf8')] = headers;
                position += (headers.key_size + headers.value_size);
                self._read(fd, position, callback);
            });
        });
    } else {
        if (callback) { callback(); }
    }
    
}

Patuljak.prototype.initialize = function initialize (callback) {
    self = this;
    fs.open(self.path, 'a+', function (err, fd) {
        self.fd = fd;
        fs.stat(self.path, function (err, stats) {
            self.position = stats.size;
            fs.open(self.path, 'r', function (err, fd) {        
                self._read(fd, 0, callback);
            });
        });
    });
};


Patuljak.prototype.HEADERS_SIZE = 22;

Patuljak.prototype.writeHeaders = function writeHeaders(headers, callback) {
    var self = this;
    
    var buffer = new Buffer(self.HEADERS_SIZE);
    buffer.writeUInt32BE(0, 0);                     // crc
    buffer.writeUInt32BE(0, 4);                     // timestamp
    buffer.writeUInt32BE(headers.version,       8); // version
    buffer.writeUInt32BE(headers.previous_ptr, 12); // previous ptr
    buffer.writeUInt16BE(headers.key_size,     16); // key size
    buffer.writeUInt32BE(headers.value_size,   18); // value size
    
    headers.position = self.position;
    fs.write(self.fd, buffer, 0, self.HEADERS_SIZE, self.position, function (err, written, buffer) {
        self.position += self.HEADERS_SIZE;
        if (callback) { callback(headers); };
    });
};

Patuljak.prototype.readHeaders = function readHeaders(fd, position, callback) {
    fs.read(fd, new Buffer(this.HEADERS_SIZE), 0, this.HEADERS_SIZE, position, function (err, bytesRead, buffer) {
        var crc = buffer.readUInt32BE(0)
          , headers = {
            'position'     : position,
            'timestamp'    : buffer.readUInt32BE(4),
            'version'      : buffer.readUInt32BE(8),
            'previous_ptr' : buffer.readUInt32BE(12),
            'key_size'     : buffer.readUInt16BE(16),
            'value_size'   : buffer.readUInt32BE(18)
        };
        callback(headers);
    });
};


Patuljak.prototype.get = function get(key, callback) {
    if (callback === undefined) { return null; }
    
    var self = this;
    
    var headers = self.keyStore[key] || null;
    if (headers === null) {
        return callback(null);
    } else {
        fs.open(self.path, 'r', function (err, fd) {
            fs.read(fd, new Buffer(headers.value_size), 0, headers.value_size, headers.position + self.HEADERS_SIZE + headers.key_size, function (err, bytesRead, buffer) {
                callback(buffer.toString());
            });    
        });
    }
};


Patuljak.prototype.put = function put(key, value, callback) {
    var self = this;
    
    // Setup new headerss
    var headers = self.keyStore[key];
    if (headers == undefined) {
        headers = {'version': 0, 'previous_ptr': 0 };
    } else {
        headers.version += 1;
        headers.previous_ptr = headers.position;
    }
    headers.timestamp  = Date.now();
    headers.key_size   = Buffer(key, 'utf8').length;
    headers.value_size = Buffer(value, 'utf8').length;
    
    self.writeHeaders(headers, function (headers) {
        self.keyStore[key] = headers;
        var buf = Buffer(key + value);
        fs.write(self.fd, buf, 0, buf.length, self.position, function (err, written, buffer) {
            self.position += buf.length;
            if (callback) { callback(); }
        });
    });
}
