import { BadRequestError } from "./errors.js";

// Metadata rows have no external identity in write payloads. Match unchanged
// values first, then a stable natural key, without replacing every row on save.
export function reconcileMetadata<T extends object>(
  existing: Array<T & { id: number }>, incoming: T[], key: (item: T) => string,
) {
  const unused = new Set(existing.map(item => item.id));
  const matches = incoming.map(item => {
    const exact = existing.find(row => unused.has(row.id) && Object.entries(item).every(([field, value]) => row[field as keyof T] === value));
    if (exact) unused.delete(exact.id);
    return exact;
  });
  const create: T[] = [];
  const update: Array<{ where: { id: number }; data: T }> = [];
  incoming.forEach((item, index) => {
    const match = matches[index] ?? existing.find(row => unused.has(row.id) && key(row) === key(item));
    if (match) { unused.delete(match.id); update.push({ where: { id: match.id }, data: item }); }
    else create.push(item);
  });
  return { create, update, deleteMany: { id: { in: [...unused] } } };
}

export function assertChildIds(existing: Array<{ id: number }>, incoming: Array<{ id?: number }>, label: string) {
  const allowed = new Set(existing.map(item => item.id));
  const seen = new Set<number>();
  for (const item of incoming) {
    if (item.id === undefined || item.id <= 0) continue;
    if (!allowed.has(item.id) || seen.has(item.id)) throw new BadRequestError(`Invalid or duplicate ${label} ID. Reload the page and try again.`);
    seen.add(item.id);
  }
}
