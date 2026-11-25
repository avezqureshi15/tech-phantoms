/** What a person can change about themselves. The server stores faiths as a list and the city as a key. */
export type ProfileDraft = { faiths: string[]; homeCity: string | null };

type Profile = { faiths: string[]; home_city: string | null };

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((item) => b.includes(item));

export const draftOf = (user: Profile): ProfileDraft => ({ faiths: [...user.faiths], homeCity: user.home_city });

/** Whether anything differs from what is saved. The order of faiths never matters. */
export function isDirty(user: Profile, draft: ProfileDraft): boolean {
  return !sameSet(user.faiths, draft.faiths) || user.home_city !== draft.homeCity;
}

/** Only what changed, so saving one thing never overwrites another that someone else just set. */
export function toUpdate(user: Profile, draft: ProfileDraft): { faiths?: string[]; home_city?: string | null } {
  return {
    ...(sameSet(user.faiths, draft.faiths) ? {} : { faiths: draft.faiths }),
    ...(user.home_city === draft.homeCity ? {} : { home_city: draft.homeCity }),
  };
}

/** Adds the faith if it is not chosen, removes it if it is. */
export function toggleFaith(faiths: string[], value: string): string[] {
  return faiths.includes(value) ? faiths.filter((item) => item !== value) : [...faiths, value];
}
