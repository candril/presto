/**
 * Whether a `repo:` filter term names this repo. A full owner/name must match exactly —
 * `acme/api` is not `acme/api-gateway`, and treating it as such would fetch a repo nobody
 * asked for, or skip the one that was — while a bare fragment matches anywhere in the name.
 */
export function filterNamesRepo(filterRepo: string, repo: string): boolean {
  const wanted = filterRepo.toLowerCase()
  const name = repo.toLowerCase()
  return wanted.includes("/") ? name === wanted : name.includes(wanted)
}
