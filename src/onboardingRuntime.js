export function createOnboardingTransitionGuard() {
  let committed = false;
  return {
    run(transition) {
      if (committed) return false;
      committed = true;
      transition();
      return true;
    },
    get committed() { return committed; },
  };
}

export const updateOnboardingPreference = (current, key, value) => ({ ...current, [key]: value });

export function toggleOnboardingLimit(current, value) {
  const limits = Array.isArray(current.limits) ? current.limits : [];
  return { ...current, limits: limits.includes(value) ? limits.filter((item) => item !== value) : [...limits, value] };
}
