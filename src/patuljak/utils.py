__author__    = 'Viktor Kerkez <alefnula@gmail.com>'
__date__      = '04 July 2011'
__copyright__ = 'Copyright (c) 2011 Viktor Kerkez'

import time

_last_timestamp = None

def timestamp():
    '''Generate a 64bit timestamp'''
    global _last_timestamp
    nanoseconds = int(time.time() * 1e9)
    # 0x01b21dd213814000 is the number of 100-ns intervals between the
    # UUID epoch 1582-10-15 00:00:00 and the Unix epoch 1970-01-01 00:00:00.
    timestamp = int(nanoseconds//100) + 0x01b21dd213814000L
    if _last_timestamp is not None and timestamp <= _last_timestamp:
        timestamp = _last_timestamp + 1
    _last_timestamp = timestamp
    return timestamp & 0xFFFFFFFFFFFFFFFF


def smart_str(s):
    if isinstance(s, unicode):
        return s.encode('utf-8')
    elif isinstance(s, str):
        return s
    else:
        return str(s)
