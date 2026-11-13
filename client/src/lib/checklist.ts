export function checklistProgress(items: { done: boolean }[] | undefined) {
  const list = items ?? [];
  const total = list.length;
  const done = list.filter((item) => item.done).length;
  return { done, total };
}
