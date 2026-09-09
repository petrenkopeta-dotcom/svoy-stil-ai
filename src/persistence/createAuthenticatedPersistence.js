import { createCloudPersistenceRepository } from "./CloudPersistenceRepository.js";
import { createSupabaseDataPort } from "./SupabaseDataPort.js";

/** Minimal runtime hook. Task 17 may consume typed results without changing UI copy here. */
export function createAuthenticatedPersistence({ authProvider, outbox, ...options } = {}) {
  const request = authProvider?.authenticatedRequest;
  const port = createSupabaseDataPort({ request });
  return createCloudPersistenceRepository({ port, outbox, ...options });
}
