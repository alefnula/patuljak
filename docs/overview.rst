Document Storage
----------------

A ``patuljak`` server hosts named databases, which store "documents". Each
document is uniquely named in the database, and ``patuljak`` provides a RESTful
HTTP API for reading and updating (add, edit, delete) database documents.

Documents are the primary unit of data in ``patuljak`` and consist of any
number of fields. Documents also include metadata that’s maintained by the
database system.

Document fields can be of varying types (text, number, date, time), and there
is no set limit to text size or element count.

The ``patuljak`` document update model is lockless and optimistic. Document
edits are made by client applications loading documents, applying changes, and
saving them back to the database. If another client editing the same document
saves their changes first, the client gets an edit conflict error on save. To
resolve the update conflict, the latest document version can be opened, the
edits reapplied and the update tried again.

Document updates (add, edit, delete) are all or nothing, either succeeding
entirely or failing completely. The database never contains partially saved or
edited documents.



ACID Properties
---------------

The ``patuljak`` file layout and commitment system features all Atomic
Consistent Isolated Durable (ACID) properties. On-disk, ``patuljak`` never
overwrites committed data or associated structures, ensuring the database file
is always in a consistent state. This is a "crash-only" design where the
``patuljak`` server does not go through a shut down process, it's simply
terminated.

Document updates (add, edit, delete) are serialized. Database readers are never
locked out and never have to wait on writers or other readers. Any number of
clients can be reading documents without being locked out or interrupted by
concurrent updates, even on the same document. ``patuljak`` read operations use
a Multi-Version Concurrency Control (MVCC) model where each client sees a
consistent snapshot of the database from the beginning to the end of the read
operation.


Documents have the advantage of data being already conveniently packaged for
storage rather than split out across numerous tables and rows in most databases
systems. When documents are committed to disk, the document fields and metadata
are packed into buffers, sequentially one document after another (helpful later
for efficient building of Fabric views).

When ``patuljak`` documents are updated, all data and associated indexes are
flushed to disk and the transactional commit always leaves the database in a
completely consistent state. Commits occur in two steps:

1. All document data and associated index updates are synchronously flushed to
   disk.
2. The updated database header is written in two consecutive, identical chunks
   to make up the first 4k of the file, and then synchronously flushed to disk.

In the event of an OS crash or power failure during step 1, the partially
flushed updates are simply forgotten on restart. If such a crash happens during
step 2 (committing the header), a surviving copy of the previous identical
headers will remain, ensuring coherency of all previously committed data.
Excepting the header area, consistency checks or fix-ups after a crash or a
power failure are never necessary.



Distributed Updates and Replication
-----------------------------------

``patuljak`` is a peer-based distributed database system, it allows for users
and servers to access and update the same shared data while disconnected and
then bi-directionally replicate those changes later.

The ``patuljak`` document storage is designed to work together to make true
bi-directional replication efficient and reliable. Both documents and designs
can replicate, allowing full database applications (including application
design, logic and data) to be replicated to laptops for offline use, or
replicated to servers in remote offices where slow or unreliable connections
make sharing data difficult.

The replication process is incremental. At the database level, replication only
examines documents updated since the last replication. Then for each updated
document, only fields and blobs that have changed are replicated across the
network. If replication fails at any step, due to network problems or crash for
example, the next replication restarts at the same document where it left off.

Partial replicas can be created and maintained. Replication can be "filtered"
by a formula, so that only particular documents or those meeting specific
criteria are replicated. This can allow users to take subsets of a large shared
database application offline for their own use, while maintaining normal
interaction with the application and that subset of data.


Conflicts
---------

Conflict detection and management are key issues for any distributed edit
system. The CouchDb storage system treats edit conflicts as a common state, not
an exceptional one. The conflict handling model is simple and "non-destructive"
while preserving single document semantics and allowing for decentralized
conflict resolution.

``patuljak`` allows for any number of conflicting documents to exist
simultaneously in the database, with each database instance deterministically
deciding which document is the “winner” and which are conflicts. Only the
winning document can appear in views, while "losing" conflicts are still
accessible and remain in the database until deleted or purged. Because conflict
documents are still regular documents, they replicate just like regular
documents and are subject to the same security and validation rules.

When distributed edit conflicts occur, every database replica sees the same
winning revision and each has the opportunity to resolve the conflict.
Resolving conflicts can be done manually or, depending on the nature of the
data and the conflict, by automated agent. The system makes decentralized
conflict resolution possible while maintaining single document database
semantics.

Conflict management continues to work even if multiple disconnected users or
agents attempt to resolve the same conflicts. If resolved conflicts result in
more conflicts, the system accommodates them in the same manner, determining
the same winner on each machine and maintaining single document semantics.



Applications
------------

Using just the basic replication model, many traditionally single server
database applications can be made distributed with almost no extra work.
``patuljak`` replication is designed to be immediately useful for basic
database applications, while also being extendable for more elaborate and
full-featured uses.

With very little database work, it is possible to build a distributed
document management application with granular security and full revision
histories. Updates to documents can be implemented to exploit incremental field
and blob replication, where replicated updates are nearly as efficient and
incremental as the actual edit differences ("diffs").

The ``patuljak`` replication model can be modified for other distributed update
models. Using a multi-document transaction, it is possible to perform
Subversion-like "all or nothing" atomic commits when replicating with an
upstream server, such that any single document conflict or validation failure
will cause the entire update to fail. Like Subversion, conflicts would be
resolved by doing a "pull" replication to force the conflicts locally, then
merging and re-replicating to the upstream server.


Implementation
--------------

For higher availability and more concurrent users, ``patuljak`` is designed for
"shared nothing" clustering. In a "shared nothing" cluster, each machine is
independent and replicates data with its cluster mates, allowing individual
server failures with zero downtime. And because consistency scans and fix-ups
aren't needed on restart, if the entire cluster fails – due to a power outage
in a datacenter, for example – the entire ``patuljak`` distributed system
becomes immediately available after a restart.
