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
        callback();
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
    buffer.writeUInt32BE(0, 0);                   // crc
    buffer.writeUInt32BE(0, 4);                   // timestamp
    buffer.writeUInt32BE(0, 8);                   // version
    buffer.writeUInt32BE(0, 12);                  // previous ptr
    buffer.writeUInt16BE(headers.key_size, 16);   // key size
    buffer.writeUInt32BE(headers.value_size, 18); // value size
    
    headers.position = self.position;
    fs.write(self.fd, buffer, 0, self.HEADERS_SIZE, self.position, function (err, written, buffer) {
        self.position += self.HEADERS_SIZE;
        if (callback) {
            callback(headers);
        };
    });
};

Patuljak.prototype.readHeaders = function readHeaders(fd, position, callback) {
    fs.read(fd, new Buffer(this.HEADERS_SIZE), 0, this.HEADERS_SIZE, position, function (err, bytesRead, buffer) {
        var crc = buffer.readUInt32BE(0)
          , headers = {
            'timestamp'    : buffer.readUInt32BE(4),
            'version'      : buffer.readUInt32BE(8),
            'previous_ptr' : buffer.readUInt32BE(12),
            'key_size'     : buffer.readUInt16BE(16),
            'value_size'   : buffer.readUInt32BE(18)
        };
        headers.position = position;
        callback(headers);
    });
};


Patuljak.prototype.get = function get(key, callback) {
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
    var headers = self.keyStore[key] || {'version': 0, 'previous_ptr': 0}
    var bkey = Buffer(key, 'utf8');
    var bvalue = Buffer(value, 'utf8');
    headers['key_size'] = bkey.length;
    headers['value_size'] = bvalue.length;
    self.writeHeaders(headers, function (headers) {
        self.keyStore[key] = headers;
        fs.write(self.fd, bkey, 0, bkey.length, self.position, function (err, written, buffer) {
            self.position += bkey.length;
            fs.write(self.fd, bvalue, 0, bvalue.length, self.position, function (err, written, buffer) {
                self.position += bvalue.length;
                callback();
            });
        });
    });
}
