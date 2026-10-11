import Dexie, { type EntityTable } from "dexie";
import {
  backupSchema,
  type Card,
  type Transaction,
  type Mapping,
  type ClassificationRule,
  type Settings,
} from "../domain/model";
import {
  initialCards,
  defaultClassifications,
  sampleTransactions,
} from "../domain/sample";
export const db = new Dexie("cardwise-v1") as Dexie & {
  cards: EntityTable<Card, "id">;
  transactions: EntityTable<Transaction, "id">;
  mappings: EntityTable<Mapping, "id">;
  classifications: EntityTable<ClassificationRule, "id">;
  settings: EntityTable<Settings, "id">;
};
db.version(1).stores({
  cards: "id",
  transactions: "id,date,cardId,category",
  mappings: "id",
  classifications: "id",
  settings: "id",
});
export async function initialize() {
  await db.transaction("rw", db.tables, async () => {
    if (!(await db.settings.get("main"))) {
      await db.cards.bulkAdd(initialCards());
      await db.classifications.bulkAdd(defaultClassifications);
      await db.settings.put({
        id: "main",
        pointValue: 1,
        knownMonths: [],
        dark: false,
      });
    }
  });
}
export async function loadSample() {
  await db.transaction(
    "rw",
    db.transactions,
    db.settings,
    db.cards,
    async () => {
      const cards = await db.cards.toArray();
      if (!cards.some((c) => c.id === "demo-flat"))
        throw Error(
          "샘플용 가상 카드가 삭제되었습니다. 초기 카드를 복원하려면 전체 삭제 후 다시 시작하세요.",
        );
      const samples = sampleTransactions();
      for (const t of samples)
        if (!(await db.transactions.get(t.id))) await db.transactions.add(t);
    },
  );
}
export async function backup() {
  return {
    schemaVersion: 1 as const,
    exportedAt: new Date().toISOString(),
    transactions: await db.transactions.toArray(),
    cards: await db.cards.toArray(),
    classifications: await db.classifications.toArray(),
    mappings: await db.mappings.toArray(),
    settings: (await db.settings.get("main"))!,
  };
}
export async function restore(raw: unknown) {
  const data = backupSchema.parse(raw);
  await db.transaction("rw", db.tables, async () => {
    for (const t of db.tables) await t.clear();
    await db.cards.bulkAdd(data.cards);
    await db.transactions.bulkAdd(data.transactions);
    await db.classifications.bulkAdd(data.classifications);
    await db.mappings.bulkAdd(data.mappings);
    await db.settings.add(data.settings);
  });
}
export async function deleteAll() {
  await db.transaction("rw", db.tables, async () => {
    for (const t of db.tables) await t.clear();
  });
  await initialize();
}
