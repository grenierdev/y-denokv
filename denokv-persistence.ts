import * as Y from "https://cdn.skypack.dev/yjs";
import { ksuid } from "../baseless/core/lib/autoid.ts";

export class DenoKVPersistence {
	#kv: Deno.Kv;
	#key: Deno.KvKey;
	#doc: Y.Doc;
	#clock = "";
	#updateLock: Promise<void> | undefined;
	#upstreamUpdate: ReturnType<Deno.Kv["watch"]>;
	#onUpdate: (update: Uint8Array, origin: any) => Promise<void>;
	#onDestroy: () => void;
	#update: () => Promise<void>;

	get syncing() {
		return this.#updateLock;
	}

	constructor(kv: Deno.Kv, key: Deno.KvKey, doc: Y.Doc) {
		this.#kv = kv;
		this.#key = key;
		this.#doc = doc;

		this.#onUpdate = async (update, origin) => {
			if (origin === "remote") {
				return;
			}
			// TODO once in a while, Y.encodeStateAsUpdate(this.#doc) and store it as "HEAD"
			this.#clock = ksuid();
			console.log(`${this.#doc.clientID} onUpdate ${this.#clock}`);
			await this.#kv.atomic()
				.set([...this.#key, "updates", this.#clock], update)
				.set([...this.#key, "signal"], null)
				.commit();
		};
		this.#onDestroy = () => {
			this.#doc.off("update", this.#onUpdate);
			this.#doc.off("destroy", this.#onDestroy);
			this.#upstreamUpdate.cancel();
		};
		this.#update = async () => {
			if (this.#updateLock) {
				await this.#updateLock;
			}

			const { promise, resolve, reject } = Promise.withResolvers<void>();
			try {
				this.#updateLock = promise;
				const updates = await Array.fromAsync(this.#kv.list({
					prefix: [...this.#key, "updates"],
					start: [...this.#key, "updates", this.#clock],
				}, { consistency: "strong" }));

				const updatesToApply = updates.filter((update) => {
					const clock = update.key.at(-1)!.toString();
					return clock > this.#clock;
				});

				if (updatesToApply.length) {
					console.log(
						`${this.#doc.clientID} Updates found ${updatesToApply.length}`,
					);
					Y.transact(this.#doc, () => {
						for (const update of updatesToApply) {
							const clock = update.key.at(-1)!.toString();
							console.log(`${this.#doc.clientID} Applying update ${clock}`);
							Y.applyUpdate(this.#doc, update.value);
						}
					}, "remote" as any);
					this.#clock = updates.at(-1)!.key.at(-1)!.toString();
					console.log(`${this.#doc.clientID} Internal clock = ${this.#clock}`);
				}
				resolve();
				this.#updateLock = undefined;
			} catch (error) {
				reject(error);
			}
		};

		this.#upstreamUpdate = this.#kv.watch([[...this.#key, "signal"]]);
		this.#upstreamUpdate.pipeTo(
			new WritableStream<Deno.KvEntryMaybe<unknown>[]>({
				write: (chunk) => {
					if (chunk.every((entry) => entry.versionstamp === null)) {
						return;
					}
					this.#update();
				},
			}),
		);

		doc.on("update", this.#onUpdate);
		doc.on("destroy", this.#onDestroy);

		// TODO load HEAD and update from there
		this.#update();
	}
}
