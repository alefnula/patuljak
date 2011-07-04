__author__    = 'Viktor Kerkez <alefnula@gmail.com>'
__date__      = '30 June 2011'
__copyright__ = 'Copyright (c) 2011 Viktor Kerkez'

import os
import struct
from collections import namedtuple

import utils


'''
      <------------------------------ crc coverage ------------------------------>       
+-----+-----------+---------+--------------+----------+------------+-----+-------+
| crc | timestamp | version | previous ptr | key size | value size | key | value |
+-----+-----------+---------+--------------+----------+------------+-----+-------+
  32        64        64           64           16          64       ...    ...
'''

HEADER_SIZE = 304
STRUCT      = '=L3QHQ'
Header      = namedtuple('Header',   'crc timestamp version previous key_size value_size')
Document    = namedtuple('Document', 'header key value')


def read_header(f):
    return Header._make(struct.unpack(STRUCT, f.read(HEADER_SIZE)))

def write_header(f, header):
    f.write(struct.pack(STRUCT, *header))

def read_doc(f, header=None):
    if header is None:
        header = read_header(f)
    return Document(header, f.read(header.key_size), f.read(header.value_size))


class Conflict(Exception):
    def __init__(self, document, tried_version):
        self.document      = document
        self.tried_version = tried_version


class Database(object):
    HEADER_SIZE = 24
        
    def __init__(self, database, shared_table=None, overwrite=True):
        '''Database backend object
        
        @param database:     Path to the database file
        @param shared_table: If provided, this shared_table will be used
        @param overwrite:    Don't check for conflicts, always overwrite
        '''
        self.database  = database
        self.table     = {} if shared_table is None else shared_table
        self.overwrite = overwrite
    
    def keys(self):
        return sorted(self.table)
    
    def __len__(self):
        return len(self.table)
    
    def load(self):
        if not os.path.isfile(self.database):
            with open(self.database, 'wb') as f:
                f.write('\0')
        else:
            with open(self.database, 'rb') as f:
                f.seek(0, 2)
                size = f.tell()
                f.seek(1)
                while f.tell() < size:
                    position =  f.tell()
                    document = self.__read_doc(f)
                    self.table[document.key] = (position, document.header)
    
    def read(self, key, version=None):
        if key in self.table:
            if isinstance(version, (str, unicode)):
                version = int(version)
            with open(self.database, 'rb') as f:
                position, header = self.table[key]
                if version is None or version == header.version:
                    f.seek(position + Database.HEADER_SIZE)
                    return self.__read_doc(f, header)
                while version < header.version and header.previous != 0:
                    f.seek(header.previous)
                    header = read_header(f)
                if version != header.version:
                    return None
                return read_doc(f, header)
        return None
    
    def write(self, key, value, version=None):
        key   = utils.smart_str(key)
        value = utils.smart_str(value)
        with open(self.database, 'rb+') as f:
            data   = '%s\0%s' % (key, value)
            length = len(data)
            f.seek(0, 2)
            position = f.tell()
            if key in self.table:
                previous, header = self.table[key]
                if not self.overwrite and header.version != version:
                    raise Conflict(self.read(key), version)
                header = Header(previous, header.version+1, length)
            else:
                header = Header(0, 0, length)
            write_header(f, header)
            f.write(data)
            f.flush()
            self.table[key] = (position, header)
            return Document(header, key, value)
