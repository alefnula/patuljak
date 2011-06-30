__author__    = 'Viktor Kerkez <alefnula@gmail.com>'
__date__      = '30 June 2011'
__copyright__ = 'Copyright (c) 2011 Viktor Kerkez'

import os
import struct
from collections import namedtuple

Header   = namedtuple('Header',   'previous version length')
Document = namedtuple('Document', 'header key value')

def smart_str(s):
    if isinstance(s, unicode):
        return s.encode('utf-8')
    elif isinstance(s, str):
        return s
    else:
        return str(s)

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
    
    def __read_header(self, f):
        return Header._make(struct.unpack('3Q', f.read(Database.HEADER_SIZE)))
    
    def __read_doc(self, f, header=None):
        if header is None:
            header = self.__read_header(f)
        return Document(header, *f.read(header.length).partition('\0')[::2])

    def __write_header(self, f, header):
        f.write(struct.pack('3Q', *header))
    
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
                    header = self.__read_header(f)
                if version != header.version:
                    return None
                return self.__read_doc(f, header)
        return None
    
    def write(self, key, value, version=None):
        key   = smart_str(key)
        value = smart_str(value)
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
            self.__write_header(f, header)
            f.write(data)
            f.flush()
            self.table[key] = (position, header)
            return Document(header, key, value)
