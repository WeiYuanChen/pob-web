import { decodeJwt } from "jose";

const POE_ACCESS_TOKEN_CLAIM = "https://pob.cool/poe/access_token";
const VALID_POE_TOKEN_ENDPOINTS = new Set([
  "https://www.pathofexile.com/oauth/token",
  "https://pathofexile.com/oauth/token",
  "https://www.pathofexile.tw/oauth/token",
  "https://pathofexile.tw/oauth/token",
  "https://poe.game.tw/oauth/token",
  "https://www.poe.game.tw/oauth/token",
]);
const POE_OAUTH_CHANNEL_PREFIX = "pob-poe-oauth:";
const POE_OAUTH_TIMEOUT_MS = 110_000;

export const POE_OAUTH_PENDING_CHANNEL = "pob-poe-oauth-channel";

export type PoeOAuthWindowMessage =
  | { accessToken: string }
  | { code: string; state: string }
  | { error: string };

export type PoeOAuthGrant = "authorization_code" | "refresh_token";

type PoeAuth0Client = {
  isAuthenticated: boolean;
  getAccessTokenSilently: (options?: { cacheMode?: "on" | "off" | "cache-only" }) => Promise<string>;
};

export function poeAccessToken(auth0AccessToken: string): string | undefined {
  const value = decodeJwt(auth0AccessToken)[POE_ACCESS_TOKEN_CLAIM];
  return typeof value === "string" ? value : undefined;
}

export async function getPoeAccessToken(
  auth0: PoeAuth0Client,
  forceAuthorization: boolean,
  authorize: (forceAuthorization: boolean) => Promise<string> = authorizePoeWithRedirect,
): Promise<string> {
  if (!forceAuthorization && auth0.isAuthenticated) {
    const accessToken = poeAccessToken(await auth0.getAccessTokenSilently());
    if (accessToken) return accessToken;
  }

  const auth0AccessToken = await authorize(forceAuthorization);
  const accessToken = poeAccessToken(auth0AccessToken);
  if (!accessToken) throw new Error("Auth0 token did not contain a PoE access token");
  return accessToken;
}

export function isPoeOAuthChannel(value: string | null): value is string {
  return value?.startsWith(POE_OAUTH_CHANNEL_PREFIX) === true;
}

function isPoeOAuthWindowMessage(value: unknown): value is PoeOAuthWindowMessage {
  if (!value || typeof value !== "object") return false;
  return (
    ("accessToken" in value && typeof value.accessToken === "string") ||
    ("code" in value && typeof value.code === "string" && "state" in value && typeof value.state === "string") ||
    ("error" in value && typeof value.error === "string")
  );
}

export function broadcastPoeOAuthResult(channelName: string, message: PoeOAuthWindowMessage) {
  const channel = new BroadcastChannel(channelName);
  channel.postMessage(message);
  channel.close();
}

export async function authenticateWithPoe(
  auth0: PoeAuth0Client,
  forceAuthorization = false,
  authorize: (forceAuthorization: boolean) => Promise<string> = authorizePoeWithRedirect,
): Promise<string> {
  const popupAccessToken = await authorize(forceAuthorization);
  const cachedAccessToken = await auth0.getAccessTokenSilently({ cacheMode: "cache-only" });
  if (!cachedAccessToken || cachedAccessToken !== popupAccessToken) {
    throw new Error("Path of Exile authorization did not update the application session");
  }
  return cachedAccessToken;
}

export function authorizePoeWithRedirect(
  forceAuthorization: boolean,
  timeoutMs = POE_OAUTH_TIMEOUT_MS,
): Promise<string> {
  const id = crypto.randomUUID();
  const channelName = `${POE_OAUTH_CHANNEL_PREFIX}${id}`;
  const channel = new BroadcastChannel(channelName);
  const url = new URL("/auth/poe-popup", window.location.origin);
  url.searchParams.set("channel", channelName);
  if (forceAuthorization) url.searchParams.set("force", "1");

  return new Promise((resolve, reject) => {
    let popup: Window | null = null;
    const timeout = window.setTimeout(() => {
      popup?.close();
      channel.close();
      reject(new Error("PoE authorization window timed out"));
    }, timeoutMs);
    channel.onmessage = ({ data }: MessageEvent<unknown>) => {
      if (!isPoeOAuthWindowMessage(data)) return;
      window.clearTimeout(timeout);
      channel.close();
      if ("accessToken" in data) {
        resolve(data.accessToken);
      } else if ("error" in data) {
        reject(new Error(data.error));
      } else {
        reject(new Error("Path of Exile authorization did not return an access token"));
      }
    };

    popup = window.open(
      url,
      `pob-poe-oauth-${id}`,
      "width=500,height=720,resizable,scrollbars=yes,status=1",
    );
    if (!popup) {
      window.clearTimeout(timeout);
      channel.close();
      reject(new Error("Unable to open the PoE authorization window"));
    }
  });
}

export function authorizePoeDirectPopup(
  authorizationUrl: string,
  timeoutMs = POE_OAUTH_TIMEOUT_MS,
): Promise<{ code?: string; error?: string; state: string; port: number }> {
  const state = poeOAuthState(authorizationUrl);
  const id = crypto.randomUUID();
  const channelName = `${POE_OAUTH_CHANNEL_PREFIX}${id}`;
  const channel = new BroadcastChannel(channelName);

  const targetUrl = new URL(authorizationUrl);
  if (!targetUrl.searchParams.has("redirect_uri")) {
    targetUrl.searchParams.set("redirect_uri", `${window.location.origin}/auth/poe-popup`);
  }

  const popupUrl = new URL("/auth/poe-popup", window.location.origin);
  popupUrl.searchParams.set("channel", channelName);
  popupUrl.searchParams.set("auth_url", targetUrl.toString());

  return new Promise((resolve) => {
    let popup: Window | null = null;
    const timeout = window.setTimeout(() => {
      popup?.close();
      channel.close();
      resolve({ error: "PoE authorization window timed out", state, port: 0 });
    }, timeoutMs);

    channel.onmessage = ({ data }: MessageEvent<unknown>) => {
      if (!isPoeOAuthWindowMessage(data)) return;
      window.clearTimeout(timeout);
      channel.close();
      if ("code" in data && "state" in data) {
        resolve({ code: data.code, state: data.state, port: 0 });
      } else if ("error" in data) {
        resolve({ error: data.error, state, port: 0 });
      } else {
        resolve({ code: crypto.randomUUID(), state, port: 0 });
      }
    };

    popup = window.open(
      popupUrl,
      `pob-poe-oauth-${id}`,
      "width=500,height=720,resizable,scrollbars=yes,status=1",
    );
    if (!popup) {
      window.clearTimeout(timeout);
      channel.close();
      resolve({ error: "Unable to open the PoE authorization window", state, port: 0 });
    }
  });
}

export function createPoeOAuthBridge(
  getAuth0: () => PoeAuth0Client,
  authorize: (forceAuthorization: boolean, timeoutMs: number) => Promise<string> = authorizePoeWithRedirect,
) {
  let authorizationAccessToken: string | undefined;

  return {
    async authorize(authorizationUrl: string, timeoutMs: number) {
      const state = poeOAuthState(authorizationUrl);
      const auth0Client = getAuth0();
      if (auth0Client.isAuthenticated) {
        try {
          authorizationAccessToken = poeAccessToken(await auth0Client.getAccessTokenSilently());
          if (authorizationAccessToken) {
            return { code: crypto.randomUUID(), state, port: 0 };
          }
        } catch {
          // Token unavailable via Auth0 silently
        }
      }
      authorizationAccessToken = undefined;
      return await authorizePoeDirectPopup(authorizationUrl, timeoutMs);
    },
    async exchange(url: string, body: string | undefined) {
      const grant = poeOAuthGrant(url, body);
      if (!grant) return undefined;
      if (grant === "authorization_code" && authorizationAccessToken) {
        const accessToken = authorizationAccessToken;
        authorizationAccessToken = undefined;
        return poeOAuthTokenResponse(accessToken);
      }
      try {
        const accessToken = await getPoeAccessToken(
          getAuth0(),
          grant === "refresh_token",
          (forceAuthorization) => authorize(forceAuthorization, POE_OAUTH_TIMEOUT_MS),
        );
        authorizationAccessToken = undefined;
        return poeOAuthTokenResponse(accessToken);
      } catch {
        return undefined;
      }
    },
  };
}

export function poeOAuthState(authorizationUrl: string): string {
  const state = new URL(authorizationUrl).searchParams.get("state");
  if (!state) throw new Error("PoE OAuth authorization request did not contain state");
  return state;
}

export function poeOAuthGrant(url: string, body: string | undefined): PoeOAuthGrant | undefined {
  if (!VALID_POE_TOKEN_ENDPOINTS.has(url) || !body) return undefined;
  const grant = new URLSearchParams(body).get("grant_type");
  return grant === "authorization_code" || grant === "refresh_token" ? grant : undefined;
}

export function poeOAuthTokenResponse(accessToken: string) {
  return JSON.stringify({
    access_token: accessToken,
    expires_in: 2_419_200,
    refresh_token: "auth0-reauthorize",
    token_type: "bearer",
  });
}

export function corsFetchPolicy(url: string, appOrigin: string): "direct" | "fallback" | undefined {
  const { hostname } = new URL(url);
  if (
    hostname === "api.pathofexile.com" ||
    hostname === "api.pathofexile.tw" ||
    hostname === "api.poe.game.tw" ||
    hostname === "pathofexile.tw" ||
    hostname === "www.pathofexile.tw" ||
    hostname === "poe.game.tw" ||
    hostname === "www.poe.game.tw"
  ) {
    return "direct";
  }
  if (hostname === "pobb.in") return appOrigin === "https://pob.cool" ? "direct" : "fallback";
  return undefined;
}

export function browserDirectFetchHeaders(headers: Readonly<Record<string, string>>): Record<string, string> {
  // Firefox forwards an author-provided User-Agent and preflights an otherwise simple cross-origin request.
  return Object.fromEntries(Object.entries(headers).filter(([key]) => key.toLowerCase() !== "user-agent"));
}
