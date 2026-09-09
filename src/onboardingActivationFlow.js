const clone = (value) => value == null ? value : structuredClone(value);

/**
 * Connects the completed onboarding wizard to the first useful local screen.
 * It deliberately delegates persistence and optional Profile sync to the existing
 * completion boundary; this layer only guards UI state against repeated submits.
 */
export function createOnboardingActivationFlow({ completionBoundary, onLocalComplete } = {}) {
  if (!completionBoundary?.complete) throw new TypeError("completionBoundary.complete is required");
  if (typeof onLocalComplete !== "function") throw new TypeError("onLocalComplete is required");

  let pending = null;
  let completed = false;
  let completedResult = null;

  const finish = (command) => {
    if (completed) return Promise.resolve({ ...clone(completedResult), replayed: true });
    if (pending) return pending;

    pending = Promise.resolve(completionBoundary.complete(clone(command)))
      .then((result) => {
        if (!result?.ok || result.localCompleted !== true) return result;
        if (!completed) {
          onLocalComplete(clone(command), clone(result));
          completed = true;
          completedResult = clone(result);
        }
        return result;
      })
      .finally(() => { pending = null; });
    return pending;
  };

  return { finish, get completed() { return completed; } };
}
