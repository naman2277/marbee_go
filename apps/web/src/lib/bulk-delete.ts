export type BulkDeleteItem = { id: string; label: string };

export type BulkDeleteResult = {
  deleted: string[];
  failed: { id: string; label: string; error: string }[];
};

/** Run delete operations sequentially and collect successes/failures. */
export async function runBulkDelete(
  items: BulkDeleteItem[],
  deleteFn: (id: string) => Promise<{ error?: string } | void>,
): Promise<BulkDeleteResult> {
  const deleted: string[] = [];
  const failed: BulkDeleteResult['failed'] = [];

  for (const item of items) {
    try {
      const result = await deleteFn(item.id);
      if (result && 'error' in result && result.error) {
        failed.push({ id: item.id, label: item.label, error: result.error });
      } else {
        deleted.push(item.id);
      }
    } catch (err) {
      failed.push({
        id: item.id,
        label: item.label,
        error: (err as Error).message || 'Delete failed',
      });
    }
  }

  return { deleted, failed };
}
