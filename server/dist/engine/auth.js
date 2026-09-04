/**
 * Exchanges Client ID/Secret for a bearer token using the OAuth2
 * client-credentials grant. The resulting token lives only in this
 * process's memory for the duration of the run — it is never written
 * to disk, logged, or included in the snapshot/diff output.
 *
 * The caller is responsible for how clientId/clientSecret themselves
 * reach this function (form input per run, or a secrets-manager lookup
 * for a scheduled job) — this module does not persist them either.
 */
export async function getAccessToken(conn) {
    const url = `${conn.baseUrl}/oauth/token`;
    const body = new URLSearchParams({
        grant_type: "client_credentials",
        client_id: conn.clientId,
        client_secret: conn.clientSecret,
    });
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
    });
    if (!res.ok) {
        // Deliberately don't include the response body in the error — it can
        // echo back request details. Surface status only.
        throw new Error(`ISC auth failed: ${res.status} ${res.statusText}. Check base URL and credentials.`);
    }
    const json = (await res.json());
    return {
        accessToken: json.access_token,
        expiresAt: Date.now() + json.expires_in * 1000,
    };
}
