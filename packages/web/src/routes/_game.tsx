import type { Game } from "pob-game";
import { Outlet } from "react-router";
import type { Route } from "../routes/+types/_game";

export type Games = {
  [key in Game]: {
    head: string;
    versions: { value: string; date: string; testResult?: "tested" | "failed" }[];
  };
};

export async function fetchVersionData(): Promise<Games> {
  try {
    const rep = await fetch(__VERSION_URL__);
    if (rep.ok) return (await rep.json()) as Games;
  } catch {
    // Fall back to local version.json if remote fetch fails (e.g. CORS)
  }
  const localRep = await fetch("/version.json");
  return (await localRep.json()) as Games;
}

export async function clientLoader(_args: Route.ClientLoaderArgs) {
  const games = await fetchVersionData();
  return { games };
}

export default function () {
  return <Outlet />;
}
