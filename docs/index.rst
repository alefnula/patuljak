.. patuljak documentation master file, created by
   sphinx-quickstart on Fri Jul 01 15:21:14 2011.
   You can adapt this file completely to your liking, but it should at least
   contain the root `toctree` directive.

Welcome to patuljak's documentation!
====================================

A ``patuljak`` instance is a directory, and we enforce that only one operating
system process will open that ``patuljak`` for writing at a given time. You can
think of that process effectively as the ``database server``. At any moment,
one file is ``active`` in that directory for writing by the server. When that
file meets a size threshold it will be closed and a new active file will be
created.

Once a file is closed, either purposefully or due to server exit, it is
considered immutable and will never be opened for writing again.

The active file is only written by appending, which means that sequential
writes do not require disk seeking.

The format that is written for each key/value entry is simple::
 
        <--------------------------------------- crc coverage --------------------------------------->       
  +-----+-----------+---------+-------------------+--------------+----------+------------+-----+-------+
  | crc | timestamp | version | previous file ptr | previous ptr | key size | value size | key | value |
  +-----+-----------+---------+-------------------+--------------+----------+------------+-----+-------+
    32        64        32              32               32           16          32       ...    ...

Filds:

crc
    32 bit
    CRC ov the rest of the packet

timestamp
    64 bit
    Current timestamp

version
    32 bit version

previous file ptr
    Pointer to the file in which the previous version of this document is stored

previous ptr
    Pointer to the previous version of this document

key size
    Size of the key in bytes

value size
    Size of value in bytes

With each write, a new entry is appended to the active file. Note that deletion
is simply a write of a special tombstone value. Thus, a ``patuljak`` data file
is nothing more than a linear sequence of these entries.


After the append completes, an in-memory structure called a ``keydir`` is
updated. A ``keydir`` is simply a hash table that maps every key in a
``patuljak`` to a fixed-size structure giving the file, offset, and size of the
most recently written entry for that key::

  {
    key: (file_id, value_size, value_pos, timestamp),
    key: (file_id, value_size, value_pos, timestamp),
    ...
  }

When a write occurs, the ``keydir`` is atomically updated with the location of
the newest data. The old data is still present on disk, but any new reads will
use the latest version available in the ``keydir``. As we’ll see later, the
``compact`` process will eventually remove the old value.

Reading a value is simple, and doesn't ever require more than a single disk
seek. We look up the key in our ``keydir``, and from there we read the data
using the ``file id``, ``position``, and ``size`` that are returned from that
lookup.


Compacting
----------

This simple model may use up a lot of space over time, since we just write out
new values without touching the old ones. If you don't need the document history,
a ``compaction`` process solves this. The compaction process iterates over all
non-active (i.e. immutable) files in a ``patuljak`` and produces as output a
set of data files containing only the ``live`` or latest versions of each
present key.

When this is done we also create a ``hint file`` next to each data file. These
are essentially like the data files but instead of the values they contain the
position and size of the values within the corresponding data file.


When a ``patuljak`` is opened by a process, it checks to see if there is
already another process in the same VM that is using that ``patuljak``. If so,
it will share the ``keydir`` with that process. If not, it scans all of the
data files in a directory in order to build a new ``keydir``. For any data file
that has a hint file, that will be scanned instead for a much quicker startup
time.

These basic operations are the essence of the ``patuljak`` system. Obviously,
we’ve not tried to expose every detail of operations in this document; our goal
here is to help you understand the general mechanisms of ``patuljak``.

``patuljak`` does not perform any compression of data, as the cost/benefit of
doing so is very application-dependent.


And let’s look at the goals we had when we set out:

- low latency per item read or written.
- high throughput, especially when writing an incoming stream of random items
- ability to handle datasets much larger than RAM w/o degradation
- crash friendliness, both in terms of fast recovery and not losing data (as
  the data files and the commit log are the same thing in ``patuljak``,
  recovery is trivial with no need for *replay*. The hint files can be used to
  make the startup process speedy)
- ease of backup and restore (since the files are immutable after rotation,
  backup can use whatever system-level mechanism is preferred by the operator
  with ease. restoration requires nothing more than placing the data files in
  the desired directory)
- a relatively simple, understandable (and thus supportable) code structure and
  data format (``patuljak`` is conceptually simple, clean code, and the data
  files are very easy to understand and manage. we feel very comfortable
  supporting a system resting atop ``patuljak``)
- predictable behavior under heavy access load or large volume


Operations
----------

open(directory_name, opts) -> patuljak_handle | error
    Open a new or existing ``patuljak`` datastore with additional options.
    Valid options include read write (if this process is going to be a writer
    and not just a reader) and sync on put (if this writer would prefer to sync
    the write file after every write operation). The directory must be readable
    and writable by this process, and only one process may open a ``patuljak``
    with read write at a time.

open(directory_name) -> patuljak_handle | error
    Open a new or existing ``patuljak`` datastore for read-only access.
    The directory and all files in it must be readable by this process.


get(patuljak_handle, key) -> {ok, Value} 
    Retrieve a value by key from a Bitcask datastore.

put(patuljak_andle, key, value) -> ok | error
    Store a key and value in a ``patuljak`` datastore.

delete(patuljak_handle, key) -> ok | error
    Delete a key from a ``patuljak`` datastore.
 
list_keys(patuljak_handle) -> [key] | error
    List all keys in a ``patuljak`` datastore.

fold(patuljak_handle, fun, acc0) -> acc
    Fold over all K/V pairs in a ``patuljak`` datastore.
    Fun is expected to be of the form: F(key, value, acc0) -> acc.

compact(directory_name) -> ok | error
    Merge several data files within a ``patuljak`` datastore into a more
    compact form. Also, produce hintfiles for faster startup.

sync(patuljak_handle) -> ok
    Force any writes to sync to disk.

close(patuljak_handle) -> ok
    Close a ``patuljak`` data store and flush all pending writes (if any) to
    disk.


Contents:

.. toctree::
   :maxdepth: 2

Indices and tables
==================

* :ref:`genindex`
* :ref:`modindex`
* :ref:`search`

