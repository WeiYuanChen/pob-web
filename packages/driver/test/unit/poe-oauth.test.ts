import { assertEquals } from "@std/assert";
import {
  deserializeSubScriptValues,
  poeOAuthAuthorizationRequest,
  serializePoeOAuthAuthorization,
  serializeSubScriptValues,
} from "../../src/js/poe-oauth.ts";

Deno.test("subscript values round trip through the browser serializer", () => {
  const values = [123.5, true, false, "result", "", undefined] as const;
  assertEquals(deserializeSubScriptValues(serializeSubScriptValues(values)), [...values]);
});

Deno.test("PoE OAuth denial is returned as an ordinary subscript result", () => {
  assertEquals(
    deserializeSubScriptValues(
      serializePoeOAuthAuthorization({ error: "The user denied access", state: "sentinel", port: 0 }),
    ),
    [undefined, "The user denied access", "sentinel", 0],
  );
});

Deno.test("PoE OAuth LaunchServer requests are recognized without matching unrelated subscripts", () => {
  const script = 'local luaSocket = require("socket")\n-- OAuth authorization code\nlocal stopAt = os.time() + 60';
  const url = "https://www.pathofexile.com/oauth/authorize?client_id=pob&response_type=code&scope=" +
    "account%3Aprofile%20account%3Aleagues%20account%3Acharacters%20account%3Atrade&state=sentinel";

  assertEquals(poeOAuthAuthorizationRequest(script, serializeSubScriptValues([url])), { url, timeoutMs: 60_000 });
  assertEquals(poeOAuthAuthorizationRequest("return true", serializeSubScriptValues([url])), undefined);
  assertEquals(
    poeOAuthAuthorizationRequest(
      script,
      serializeSubScriptValues([url.replace("client_id=pob", "client_id=other")]),
    ),
    undefined,
  );
  assertEquals(
    poeOAuthAuthorizationRequest(script.replace("+ 60", "+ 30"), serializeSubScriptValues([url])),
    { url, timeoutMs: 30_000 },
  );
});

Deno.test("PoE OAuth LaunchServer requests recognize Taiwan server origins", () => {
  const script = 'local luaSocket = require("socket")\n-- OAuth authorization code\nlocal stopAt = os.time() + 60';
  const twUrl = "https://www.pathofexile.tw/oauth/authorize?client_id=pob&response_type=code&scope=" +
    "account%3Aprofile%20account%3Aleagues%20account%3Acharacters%20account%3Atrade&state=sentinel";
  const gameTwUrl = "https://poe.game.tw/oauth/authorize?client_id=pob&response_type=code&scope=" +
    "account%3Aprofile%20account%3Aleagues%20account%3Acharacters%20account%3Atrade&state=sentinel";

  assertEquals(poeOAuthAuthorizationRequest(script, serializeSubScriptValues([twUrl])), {
    url: twUrl,
    timeoutMs: 60_000,
  });
  assertEquals(poeOAuthAuthorizationRequest(script, serializeSubScriptValues([gameTwUrl])), {
    url: gameTwUrl,
    timeoutMs: 60_000,
  });
});
