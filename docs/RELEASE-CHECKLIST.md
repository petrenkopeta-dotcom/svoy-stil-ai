# Release checklist

- [ ] Release commit находится в защищённом `main` и имеет успешные CI/CodeQL checks.
- [ ] Dependency audit не содержит high/critical production vulnerabilities.
- [ ] Publication boundary и bundle budget прошли.
- [ ] Production build не содержит direct-auth/local-pilot flags.
- [ ] Secrets настроены через deployment secret manager.
- [ ] Supabase migrations и RLS проверены в целевой среде негативными owner/anon cases.
- [ ] Cookie имеет `HttpOnly`, `Secure`, `SameSite=Lax`.
- [ ] Privacy delete/export проверены на синтетическом аккаунте.
- [ ] Rollback на предыдущий SHA проверен.
- [ ] Owner дежурства и приватный security contact назначены.

Невыполненный пункт блокирует production release; исключения фиксируются отдельным risk acceptance с владельцем и сроком.
