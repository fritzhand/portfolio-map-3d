// Where the vendored world's files live (public/island), whatever sub-path the map is served under.
export const ISLAND_BASE: string = new URL(import.meta.env.BASE_URL + "island/", window.location.href).toString();
