CREATE TABLE workspace (id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL CHECK(revision>=0),updated_at TEXT NOT NULL,chunk_count INTEGER NOT NULL CHECK(chunk_count>0),commit_key TEXT NOT NULL);
CREATE TABLE workspace_chunks (revision INTEGER NOT NULL,position INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(revision,position));
INSERT INTO workspace VALUES(1,0,'1970-01-01T00:00:00.000Z',1,'initial');
INSERT INTO workspace_chunks VALUES(0,0,'{"schemaVersion":2,"customRecipes":[],"collections":[],"favorites":[],"stock":{},"equipment":{},"versions":[],"plan":[],"coffeeRecords":[],"theme":"oat"}');
