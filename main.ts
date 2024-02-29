import * as Y from "https://cdn.skypack.dev/yjs";
import { DenoKVPersistence } from "./denokv-persistence.ts";
import { ruid } from "../baseless/core/lib/autoid.ts";

const kv = await Deno.openKv();

// const id = ruid("doc_");
const id = "doc_n2l469DqDvSiQWIXrJ3vZv";
const docA = new Y.Doc();
const docB = new Y.Doc();

const persistenceA = new DenoKVPersistence(kv, [id], docA);
const persistenceB = new DenoKVPersistence(kv, [id], docB);

await persistenceA.syncing;
await persistenceB.syncing;

const mapA = docA.getMap("lemap");
const mapB = docB.getMap("lemap");

// mapA.set("time", Date.now());

await new Promise((resolve) => setTimeout(resolve, 1000));

console.log(id);
console.log(docA.clientID, docA.toJSON());
console.log(docB.clientID, docB.toJSON());

Deno.exit();
