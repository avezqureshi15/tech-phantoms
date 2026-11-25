export type DeadlineResult<T> = { timedOut: true } | { timedOut: false; value: T };

export function raceDeadline<T>(operation: Promise<T>, deadlineAt: number): Promise<DeadlineResult<T>> {
  const remainingMs = Math.max(0, deadlineAt - Date.now());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve({ timedOut: true }), remainingMs);
    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve({ timedOut: false, value });
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
